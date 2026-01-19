#!/bin/bash

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --raw-file-path)
            raw_file_path="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --raw-file-path <path>"
            echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$raw_file_path" ]; then
    echo "Error: --raw-file-path is required"
    echo "Usage: $0 --raw-file-path <path>"
    echo "  Example: $0 --raw-file-path ./raw_files/judge_openai.jsonl"
    exit 1
fi

# Check if raw file exists
if [ ! -f "$raw_file_path" ]; then
    echo "Error: Raw file not found: $raw_file_path"
    exit 1
fi

# Get the directory of this script
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
create_judge_batch_script="${script_dir}/create_judge_batch.sh"

# Check if create_judge_batch.sh exists
if [ ! -f "$create_judge_batch_script" ]; then
    echo "Error: create_judge_batch.sh not found at $create_judge_batch_script"
    exit 1
fi

# Parse provider from raw file path (format: judge_{provider}...)
raw_file_basename=$(basename "$raw_file_path")
raw_file_name_no_ext="${raw_file_basename%.jsonl}"
if [[ "$raw_file_name_no_ext" =~ ^judge_([^_]+) ]]; then
    excluded_provider="${BASH_REMATCH[1]}"
else
    echo "Warning: Could not parse provider from raw file path. Expected format: judge_{provider}..."
    excluded_provider=""
fi

# If excluded_provider is not one of the four valid providers, default to mistral
if [[ "$excluded_provider" != "openai" && "$excluded_provider" != "gemini" && "$excluded_provider" != "anthropic" && "$excluded_provider" != "mistral" ]]; then
    excluded_provider="mistral"
fi

echo "Creating jury batches for raw file: $raw_file_path"
if [ -n "$excluded_provider" ]; then
    echo "Excluding judges from same provider: $excluded_provider"
fi
echo ""

# Create batches for jury models (TODO.md lines 39-42), excluding same provider
if [ "$excluded_provider" != "openai" ]; then
    "${create_judge_batch_script}" --raw-file-path "${raw_file_path}" --provider openai --model gpt-5.1 --thinking-level high
fi
if [ "$excluded_provider" != "gemini" ]; then
    "${create_judge_batch_script}" --raw-file-path "${raw_file_path}" --provider gemini --model gemini-3-pro-preview --thinking-level high
fi
if [ "$excluded_provider" != "anthropic" ]; then
    "${create_judge_batch_script}" --raw-file-path "${raw_file_path%.jsonl}_max_tokens.jsonl" --provider anthropic --model claude-opus-4-5 --thinking-budget 32000
fi
if [ "$excluded_provider" != "mistral" ]; then
    "${create_judge_batch_script}" --raw-file-path "${raw_file_path}" --provider mistral --model mistral-large-2512
fi
