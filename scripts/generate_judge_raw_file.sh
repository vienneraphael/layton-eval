#!/bin/bash

# Script to run benchmark_judge/generate_raw_file.py with all argparse arguments as flags
# Runs the command twice: once without --max-tokens and once with --max-tokens

# Parse command line arguments
split=""
results_file_path=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --split)
            split="$2"
            shift 2
            ;;
        --results-file-path)
            results_file_path="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --split <vlm|llm> --results-file-path <path>"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$split" ]; then
    echo "Error: --split is required"
    echo "Usage: $0 --split <vlm|llm> --results-file-path <path>"
    exit 1
fi

if [ -z "$results_file_path" ]; then
    echo "Error: --results-file-path is required"
    echo "Usage: $0 --split <vlm|llm> --results-file-path <path>"
    exit 1
fi

# Run without --max-tokens
echo "Running without --max-tokens..."
uv run python src/layton_eval/benchmark_judge/generate_raw_file.py --split "$split" --results-file-path "$results_file_path"

# Run with --max-tokens
echo ""
echo "Running with --max-tokens..."
uv run python src/layton_eval/benchmark_judge/generate_raw_file.py --split "$split" --results-file-path "$results_file_path" --max-tokens
