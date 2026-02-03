#!/bin/bash

URL=${1:-http://localhost:3000}
REQUESTS=${2:-100}
DELAY=${3:-0.5}

echo "Generating traffic to $URL"
echo "Total requests: $REQUESTS"
echo "Delay between requests: ${DELAY}s"
echo ""

for i in $(seq 1 $REQUESTS); do
  if [ $((i % 2)) -eq 0 ]; then
    curl -s "$URL/" > /dev/null && echo "[$i/$REQUESTS] GET / - OK"
  else
    curl -s "$URL/health" > /dev/null && echo "[$i/$REQUESTS] GET /health - OK"
  fi
  sleep $DELAY
done

echo ""
echo "Traffic generation complete!"
