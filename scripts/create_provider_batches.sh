#!/bin/bash

# Grid search for all parameter combinations
# splits: vlm, llm
# hints: 0, 1, 2, 3, 4
# models: gpt-5.1-high, gpt-4.5-preview-2025-02-27, chatgpt-4o-latest-20250805, gpt-5-high, gpt-5.1
# Usage: ./openai_batches_grid.sh <provider> <models>
#   provider: Provider name (required)
#   models: Comma-separated list of model names (required)
#           Example: "gpt-5.1-high,gpt-4.5-preview-2025-02-27,chatgpt-4o-latest-20250805"

# Check if provider is provided
if [ -z "$1" ]; then
    echo "Error: Provider is required"
    echo "Usage: $0 <provider> <models>"
    echo "  Example: $0 openai \"gpt-5.1-high,gpt-4.5-preview-2025-02-27\""
    exit 1
fi

# Check if models are provided
if [ -z "$2" ]; then
    echo "Error: Models are required"
    echo "Usage: $0 <provider> <models>"
    echo "  Example: $0 openai \"gpt-5.1-high,gpt-4.5-preview-2025-02-27\""
    exit 1
fi

provider="$1"

# Parse models string into array (comma-separated)
IFS=',' read -ra models <<< "$2"

for split in "vlm" "llm"; do
    for hints in 0 1 2 3 4; do
        for model in "${models[@]}"; do
            # Create sanitized model name for file paths (replace special chars with hyphens)
            model_sanitized=$(echo "$model" | sed 's/[^a-zA-Z0-9-]/-/g')

            # Create batch name
            batch_name="benchmark-${split}-hints-${hints}-${provider}-${model_sanitized}"

            # Define file paths
            raw_file_path="./raw_files/benchmark_${split}_hints_${hints}.jsonl"
            processed_file_path="./processed_files/benchmark_${split}_hints_${hints}_${provider}_${model_sanitized}.jsonl"
            results_file_path="./results/benchmark_${split}_hints_${hints}_${provider}_${model_sanitized}.jsonl"

            echo "Creating batch: $batch_name"

            batchling create --start \
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
