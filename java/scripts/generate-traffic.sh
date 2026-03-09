#!/bin/bash
# Traffic generator + trace verification for ECS Fargate services
# Discovers task public IPs, sends concurrent traffic, waits, then queries X-Ray for trace counts.

set -e

REGION=${AWS_REGION:-ap-southeast-1}
CLUSTER="java-hello-demo"
THREADS=${1:-5}
DURATION=${2:-10}
BREAK=${3:-30}
TRACE_WAIT=${4:-60}

COLLECTOR_LESS_SVC_NAME="java-hello-demo"
WITH_COLLECTOR_SVC_NAME="java-hello-with-collector"

echo "=== Traffic Generator + Trace Verifier ==="
echo "Region:     $REGION"
echo "Cluster:    $CLUSTER"
echo "Threads:    $THREADS"
echo "Duration:   ${DURATION}s per service"
echo "Break:      ${BREAK}s between services"
echo "Trace wait: ${TRACE_WAIT}s after traffic"
echo ""

# --- Helpers ---

get_service_ip() {
  local service_arn=$1
  local task_arn=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$service_arn" \
    --region "$REGION" --query "taskArns[0]" --output text)
  if [ "$task_arn" = "None" ] || [ -z "$task_arn" ]; then
    echo ""; return
  fi
  local eni=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task_arn" \
    --region "$REGION" --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)
  aws ec2 describe-network-interfaces --network-interface-ids "$eni" \
    --region "$REGION" --query "NetworkInterfaces[0].Association.PublicIp" --output text
}

send_traffic() {
  local url=$1
  local label=$2
  local end_time=$((SECONDS + DURATION))
  local pids=()
  local tmpdir=$(mktemp -d)

  echo "[$label] Sending traffic to $url for ${DURATION}s with $THREADS threads..."

  for i in $(seq 1 "$THREADS"); do
    (
      count=0
      while [ $SECONDS -lt $end_time ]; do
        curl -s -o /dev/null --connect-timeout 3 "$url" 2>/dev/null || true
        count=$((count + 1))
      done
      echo "$count" > "$tmpdir/thread_$i"
      echo "  Thread $i: $count requests"
    ) &
    pids+=($!)
  done

  for pid in "${pids[@]}"; do wait "$pid"; done

  local total=0
  for i in $(seq 1 "$THREADS"); do
    local c=$(cat "$tmpdir/thread_$i" 2>/dev/null || echo 0)
    total=$((total + c))
  done
  rm -rf "$tmpdir"

  echo "[$label] Total: $total requests"
  echo ""
  eval "${label//-/_}_REQUESTS=$total"
}

query_traces() {
  local service_name=$1
  local start_time=$2
  local end_time=$3

  local count=$(aws xray get-trace-summaries \
    --start-time "$start_time" --end-time "$end_time" \
    --filter-expression "service(\"$service_name\")" \
    --region "$REGION" --output json \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['TraceSummaries']))")
  echo "$count"
}

# --- Discover services ---
echo "Discovering ECS services..."
services=$(aws ecs list-services --cluster "$CLUSTER" --region "$REGION" --query "serviceArns" --output json)
collector_less_svc=$(echo "$services" | grep -o '"[^"]*JavaHelloService[^"]*"' | tr -d '"')
with_collector_svc=$(echo "$services" | grep -o '"[^"]*JavaHelloWithCollectorService[^"]*"' | tr -d '"')
echo "  Collector-less: $(echo $collector_less_svc | grep -o '[^/]*$')"
echo "  With-collector: $(echo $with_collector_svc | grep -o '[^/]*$')"
echo ""

# --- Resolve IPs ---
echo "Resolving public IPs..."
IP1=$(get_service_ip "$collector_less_svc")
IP2=$(get_service_ip "$with_collector_svc")
echo "  Collector-less: $IP1"
echo "  With-collector: $IP2"
echo ""

if [ -z "$IP1" ] || [ "$IP1" = "None" ]; then echo "ERROR: No IP for collector-less service"; exit 1; fi
if [ -z "$IP2" ] || [ "$IP2" = "None" ]; then echo "ERROR: No IP for with-collector service"; exit 1; fi

# --- Record start time ---
TRAFFIC_START=$(date -u '+%Y-%m-%dT%H:%M:%S')

# --- Phase 1 ---
echo "========================================="
echo "Phase 1: Collector-less ($COLLECTOR_LESS_SVC_NAME)"
echo "========================================="
collector_less_REQUESTS=0
send_traffic "http://${IP1}:8080/" "collector-less"
CL_REQUESTS=$collector_less_REQUESTS

echo "Waiting ${BREAK}s before next phase..."
sleep "$BREAK"

# --- Phase 2 ---
echo "========================================="
echo "Phase 2: With-collector ($WITH_COLLECTOR_SVC_NAME)"
echo "========================================="
with_collector_REQUESTS=0
send_traffic "http://${IP2}:8080/" "with-collector"
WC_REQUESTS=$with_collector_REQUESTS

# --- Wait for traces ---
echo "========================================="
echo "Waiting ${TRACE_WAIT}s for traces to be ingested..."
echo "========================================="
sleep "$TRACE_WAIT"

# --- Query traces ---
TRAFFIC_END=$(date -u '+%Y-%m-%dT%H:%M:%S')

echo ""
echo "Querying X-Ray traces ($TRAFFIC_START → $TRAFFIC_END)..."
CL_TRACES=$(query_traces "$COLLECTOR_LESS_SVC_NAME" "$TRAFFIC_START" "$TRAFFIC_END")
WC_TRACES=$(query_traces "$WITH_COLLECTOR_SVC_NAME" "$TRAFFIC_START" "$TRAFFIC_END")

# --- Report ---
echo ""
echo "========================================="
echo "           SAMPLING REPORT"
echo "========================================="
echo ""
printf "%-25s %10s %10s %10s\n" "Service" "Requests" "Traces" "Rate"
printf "%-25s %10s %10s %10s\n" "-------------------------" "----------" "----------" "----------"

if [ "$CL_REQUESTS" -gt 0 ]; then
  CL_RATE=$(python3 -c "print(f'{($CL_TRACES/$CL_REQUESTS)*100:.1f}%')")
else
  CL_RATE="N/A"
fi

if [ "$WC_REQUESTS" -gt 0 ]; then
  WC_RATE=$(python3 -c "print(f'{($WC_TRACES/$WC_REQUESTS)*100:.1f}%')")
else
  WC_RATE="N/A"
fi

printf "%-25s %10d %10d %10s\n" "$COLLECTOR_LESS_SVC_NAME" "$CL_REQUESTS" "$CL_TRACES" "$CL_RATE"
printf "%-25s %10d %10d %10s\n" "$WITH_COLLECTOR_SVC_NAME" "$WC_REQUESTS" "$WC_TRACES" "$WC_RATE"
echo ""
echo "Console: https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#xray:traces"
echo "========================================="
