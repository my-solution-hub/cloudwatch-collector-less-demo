ARG PLATFORM
FROM --platform=linux/${PLATFORM} amazoncorretto:17

# Download AWS OpenTelemetry Java Agent
RUN curl -L -o /opt/aws-opentelemetry-agent.jar \
    https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar

ENV JAVA_TOOL_OPTIONS=-javaagent:/opt/aws-opentelemetry-agent.jar
COPY ./target/hello.jar /app/demo.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/demo.jar"]