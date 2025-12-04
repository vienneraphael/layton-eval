#!/bin/bash

if [ -z "$1" ]; then
    echo "Error: Provider is required"
    echo "Usage: $0 <provider> <models>"
    echo "  Example: $0 openai \"gpt-5.1-high,gpt-4.5-preview-2025-02-27\""
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: Models are required"
    echo "Usage: $0 <provider> <models>"
    echo "  Example: $0 openai \"gpt-5.1-high,gpt-4.5-preview-2025-02-27\""
    exit 1
fi

provider="$1"

IFS=',' read -ra models <<< "$2"

for split in "vlm" "llm"; do
    for hints in 0 1 2 3 4; do
        for model in "${models[@]}"; do
            model_sanitized=$(echo "$model" | sed 's/[^a-zA-Z0-9-]/-/g')
            batch_name="benchmark-${split}-hints-${hints}-${provider}-${model_sanitized}"
            if [ "$provider" = "anthropic" ]; then
                raw_file_path="./raw_files/benchmark_${split}_hints_${hints}_max_tokens.jsonl"
            else
                raw_file_path="./raw_files/benchmark_${split}_hints_${hints}.jsonl"
            fi
            processed_file_path="./processed_files/benchmark_${split}_hints_${hints}_${provider}_${model_sanitized}.jsonl"
            results_file_path="./results/benchmark_${split}_hints_${hints}_${provider}_${model_sanitized}.jsonl"
            echo "Creating batch: $batch_name"
            batchling create \
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
        done
    done
done

echo "All batches created!"
