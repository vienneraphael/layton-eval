#!/bin/bash

# Script to run benchmark_judge/generate_raw_file.py with all argparse arguments as flags
# Runs the command twice: once without --max-tokens and once with --max-tokens

# Parse command line arguments
results_file_path=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --results-file-path)
            results_file_path="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --results-file-path <path>"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$results_file_path" ]; then
    echo "Error: --results-file-path is required"
    echo "Usage: $0 --results-file-path <path>"
    exit 1
fi

# Extract split from filename (4th element when split by "_")
filename=$(basename "$results_file_path")
split=$(echo "$filename" | cut -d'_' -f4)

if [ -z "$split" ]; then
    echo "Error: Could not extract split from filename $filename"
    exit 1
fi

# Run without --max-tokens
echo "Running without --max-tokens for split: $split..."
python src/layton_eval/benchmark_judge/generate_raw_file.py --split "$split" --results-file-path "$results_file_path"

# Run with --max-tokens
echo ""
echo "Running with --max-tokens for split: $split..."
python src/layton_eval/benchmark_judge/generate_raw_file.py --split "$split" --results-file-path "$results_file_path" --max-tokens