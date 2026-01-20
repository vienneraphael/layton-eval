#!/bin/bash

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --provider)
            provider="$2"
            shift 2
            ;;
        --model)
            model="$2"
            shift 2
            ;;
        --split)
            split="$2"
            shift 2
            ;;
        --hints)
            hints="$2"
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
        --max-tokens)
            max_tokens="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --provider <provider> --model <model> --split <split> --hints <hints> [--thinking-level <level>] [--thinking-budget <budget>]"
            echo "  Example: $0 --provider openai --model gpt-5.1-high --split vlm --hints 0"
            echo "  Example: $0 --provider openai --model gpt-5.1-high --split vlm --hints 0 --thinking-level medium --thinking-budget 1000"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$provider" ]; then
    echo "Error: --provider is required"
    echo "Usage: $0 --provider <provider> --model <model> --split <split> --hints <hints> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --provider openai --model gpt-5.1-high --split vlm --hints 0"
    exit 1
fi

if [ -z "$model" ]; then
    echo "Error: --model is required"
    echo "Usage: $0 --provider <provider> --model <model> --split <split> --hints <hints> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --provider openai --model gpt-5.1-high --split vlm --hints 0"
    exit 1
fi

if [ -z "$split" ]; then
    echo "Error: --split is required"
    echo "Usage: $0 --provider <provider> --model <model> --split <split> --hints <hints> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --provider openai --model gpt-5.1-high --split vlm --hints 0"
    exit 1
fi

if [ -z "$hints" ]; then
    echo "Error: --hints is required"
    echo "Usage: $0 --provider <provider> --model <model> --split <split> --hints <hints> [--thinking-level <level>] [--thinking-budget <budget>]"
    echo "  Example: $0 --provider openai --model gpt-5.1-high --split vlm --hints 0"
    exit 1
fi

model_sanitized=$(echo "$model" | sed 's/[^a-zA-Z0-9-]/-/g')
batch_name="benchmark_${model_sanitized}_${split}_hints_${hints}"
if [ -n "$max_tokens" ] || [ "$provider" = "anthropic" ] || [ "$provider" = "together" ]; then
    raw_file_path="./raw_files/benchmark_${split}_hints_${hints}_max_tokens_${max_tokens}.jsonl"
else
    raw_file_path="./raw_files/benchmark_${split}_hints_${hints}.jsonl"
fi
processed_file_path="./processed_files/benchmark_${provider}_${model_sanitized}_${split}_hints_${hints}.jsonl"
results_file_path="./results/benchmark_${provider}_${model_sanitized}_${split}_hints_${hints}.jsonl"
echo "Creating batch: $batch_name"

# Build description with optional thinking parameters
description="Benchmark evaluation for ${split} split with ${hints} hints using ${model}"
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
    --title \"Benchmark evaluation - ${split} split, ${hints} hints\" \
    --description \"$description\" \
    --provider \"$provider\" \
    --endpoint /v1/chat/completions \
    --raw-file-path \"$raw_file_path\" \
    --processed-file-path \"$processed_file_path\" \
    --results-file-path \"$results_file_path\" \
    --response-format-path ./json_schemas/benchmark_answer_schema.json"

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

echo "Batch created!"
