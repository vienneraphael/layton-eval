#!/bin/bash

if [ -z "$1" ]; then
    echo "Error: Provider is required"
    echo "Usage: $0 <provider> <model> <split> <hints>"
    echo "  Example: $0 openai gpt-5.1-high vlm 0"
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: Model is required"
    echo "Usage: $0 <provider> <model> <split> <hints>"
    echo "  Example: $0 openai gpt-5.1-high vlm 0"
    exit 1
fi

if [ -z "$3" ]; then
    echo "Error: Split is required"
    echo "Usage: $0 <provider> <model> <split> <hints>"
    echo "  Example: $0 openai gpt-5.1-high vlm 0"
    exit 1
fi

if [ -z "$4" ]; then
    echo "Error: Hints is required"
    echo "Usage: $0 <provider> <model> <split> <hints>"
    echo "  Example: $0 openai gpt-5.1-high vlm 0"
    exit 1
fi

provider="$1"
model="$2"
split="$3"
hints="$4"

model_sanitized=$(echo "$model" | sed 's/[^a-zA-Z0-9-]/-/g')
batch_name="benchmark-${provider}-${model_sanitized}-${split}-hints-${hints}"
if [ "$provider" = "anthropic" ]; then
    raw_file_path="./raw_files/benchmark_${split}_hints_${hints}_max_tokens.jsonl"
else
    raw_file_path="./raw_files/benchmark_${split}_hints_${hints}.jsonl"
fi
processed_file_path="./processed_files/benchmark_${provider}_${model_sanitized}_${split}_hints_${hints}.jsonl"
results_file_path="./results/benchmark_${provider}_${model_sanitized}_${split}_hints_${hints}.jsonl"
echo "Creating batch: $batch_name"clea
batchling create \
    --start \
    --name "$batch_name" \
    --model "$model" \
    --title "Benchmark evaluation - ${split} split, ${hints} hints" \
    --description "Benchmark evaluation for ${split} split with ${hints} hints using ${model}" \
    --provider "$provider" \
    --endpoint /v1/chat/completions \
    --raw-file-path "$raw_file_path" \
    --processed-file-path "$processed_file_path" \
    --results-file-path "$results_file_path" \
    --response-format-path ./json_schemas/benchmark_answer_schema.json

echo "Batch created!"
