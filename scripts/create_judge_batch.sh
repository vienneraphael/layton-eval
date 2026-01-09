#!/bin/bash

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --raw-file-path)
            raw_file_path="$2"
            shift 2
            ;;
        --provider)
            provider="$2"
            shift 2
            ;;
        --model)
            model="$2"
            shift 2
            ;;
        --thinking-level)
            thinking_level="$2"
            shift 2
            ;;
        --thinking-budget)
            thinking_budget="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --raw-file-path <path> --provider <provider> --model <model> [--thinking-level <level>] [--thinking-budget <budget>]"
            echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl --provider openai --model gpt-4"
            echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl --provider openai --model gpt-4 --thinking-level medium --thinking-budget 1000"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$raw_file_path" ]; then
    echo "Error: --raw-file-path is required"
    echo "Usage: $0 --raw-file-path <path> --provider <provider> --model <model> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl --provider openai --model gpt-4"
    exit 1
fi

if [ -z "$provider" ]; then
    echo "Error: --provider is required"
    echo "Usage: $0 --raw-file-path <path> --provider <provider> --model <model> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl --provider openai --model gpt-4"
    exit 1
fi

if [ -z "$model" ]; then
    echo "Error: --model is required"
    echo "Usage: $0 --raw-file-path <path> --provider <provider> --model <model> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl --provider openai --model gpt-4"
    exit 1
fi

# Extract filename without extension from raw_file_path
raw_file_basename=$(basename "$raw_file_path")
raw_file_name_no_extension="${raw_file_basename%.jsonl}"

# Sanitize model name
model_sanitized=$(echo "$model" | sed 's/[^a-zA-Z0-9-]/-/g')

# Build processed and results file paths
processed_file_path="./processed_files/${raw_file_name_no_extension}_by_${provider}_${model_sanitized}.jsonl"
results_file_path="./results/${raw_file_name_no_extension}_by_${provider}_${model_sanitized}.jsonl"

# Build batch name
batch_name="${raw_file_name_no_extension}_by_${provider}_${model_sanitized}"

echo "Creating judge batch: $batch_name"

# Build description with optional thinking parameters
description="Judge evaluation using ${provider}:${model}"
if [ -n "$thinking_level" ] || [ -n "$thinking_budget" ]; then
    description="${description} with reasoning"
    if [ -n "$thinking_level" ]; then
        description="${description} (level: ${thinking_level})"
    fi
    if [ -n "$thinking_budget" ]; then
        description="${description} (budget: ${thinking_budget})"
    fi
fi

# Build batchling command with optional thinking parameters
batchling_cmd="batchling create \
    --name \"$batch_name\" \
    --model \"$model\" \
    --title \"Judge evaluation - ${raw_file_name_no_extension}\" \
    --description \"$description\" \
    --provider \"$provider\" \
    --endpoint /v1/chat/completions \
    --raw-file-path \"$raw_file_path\" \
    --processed-file-path \"$processed_file_path\" \
    --results-file-path \"$results_file_path\" \
    --response-format-path ./json_schemas/benchmark_judgement_schema.json"

# Add optional thinking_level if provided
if [ -n "$thinking_level" ]; then
    batchling_cmd="$batchling_cmd --thinking-level \"$thinking_level\""
fi

# Add optional thinking_budget if provided
if [ -n "$thinking_budget" ]; then
    batchling_cmd="$batchling_cmd --thinking-budget \"$thinking_budget\""
fi

# Execute the command
eval "$batchling_cmd"

echo "Judge batch created!"

