#!/bin/bash

# Script to run benchmark/generate_raw_file.py for a single file

# Parse command line arguments
split=""
hints=""
max_tokens=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --split)
            split="$2"
            shift 2
            ;;
        --hints)
            hints="$2"
            shift 2
            ;;
        --max-tokens)
            max_tokens=true
            shift 1
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --split <vlm|llm> --hints <int> [--max-tokens]"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$split" ]; then
    echo "Error: --split is required"
    echo "Usage: $0 --split <vlm|llm> --hints <int> [--max-tokens]"
    exit 1
fi

if [ -z "$hints" ]; then
    echo "Error: --hints is required"
    echo "Usage: $0 --split <vlm|llm> --hints <int> [--max-tokens]"
    exit 1
fi

echo "Running: split=$split, hints=$hints, max_tokens=$max_tokens"

if [ "$max_tokens" = true ]; then
    python src/layton_eval/benchmark/generate_raw_file.py \
        --split "$split" \
        --hints "$hints" \
        --max-tokens
else
    python src/layton_eval/benchmark/generate_raw_file.py \
        --split "$split" \
        --hints "$hints"
fi
