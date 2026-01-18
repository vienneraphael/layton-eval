#!/bin/bash

# Script to prepare a benchmark batch by generating the raw file and creating the batch

# Parse command line arguments
split=""
hints=""
max_tokens=""
provider=""
model=""
thinking_level=""
thinking_budget=""

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
            max_tokens="$2"
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
            echo "Usage: $0 --split <vlm|llm> --hints <int> --provider <provider> --model <model> [--max-tokens <int>] [--thinking-level <level>] [--thinking-budget <budget>]"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$split" ]; then
    echo "Error: --split is required"
    exit 1
fi
if [ -z "$hints" ]; then
    echo "Error: --hints is required"
    exit 1
fi
if [ -z "$provider" ]; then
    echo "Error: --provider is required"
    exit 1
fi
if [ -z "$model" ]; then
    echo "Error: --model is required"
    exit 1
fi

echo "Generating raw file..."

# Prepare arguments for generate_raw_file.sh
generate_args="--split $split --hints $hints"
if [ -n "$max_tokens" ]; then
    generate_args="$generate_args --max-tokens $max_tokens"
fi

# Execute generate_raw_file.sh
./scripts/generate_raw_file.sh $generate_args
if [ $? -ne 0 ]; then
    echo "Error generating raw file"
    exit 1
fi

echo "Creating batch..."

# Prepare arguments for create_batch.sh
create_args="--provider $provider --model $model --split $split --hints $hints"
if [ -n "$max_tokens" ]; then
    create_args="$create_args --max-tokens $max_tokens"
fi
if [ -n "$thinking_level" ]; then
    create_args="$create_args --thinking-level $thinking_level"
fi
if [ -n "$thinking_budget" ]; then
    create_args="$create_args --thinking-budget $thinking_budget"
fi

# Execute create_batch.sh
./scripts/create_batch.sh $create_args
