#!/bin/bash

# Script to prepare jury batches by:
# 1. Generating raw judge files from results
# 2. Creating jury batches for all jury models

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
            echo "  Example: $0 --results-file-path ./results/benchmark_openai_gpt-5.1_llm.jsonl"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$results_file_path" ]; then
    echo "Error: --results-file-path is required"
    echo "Usage: $0 --results-file-path <path>"
    echo "  Example: $0 --results-file-path ./results/benchmark_openai_gpt-5.1_llm.jsonl"
    exit 1
fi

# Check if results file exists
if [ ! -f "$results_file_path" ]; then
    echo "Error: Results file not found: $results_file_path"
    exit 1
fi

# Get the directory of this script
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
generate_judge_script="${script_dir}/generate_judge_raw_file.sh"
create_jury_script="${script_dir}/create_jury_batches.sh"

# Check if required scripts exist
if [ ! -f "$generate_judge_script" ]; then
    echo "Error: generate_judge_raw_file.sh not found at $generate_judge_script"
    exit 1
fi

if [ ! -f "$create_jury_script" ]; then
    echo "Error: create_jury_batches.sh not found at $create_jury_script"
    exit 1
fi

# Step 1: Generate raw judge files
echo "=========================================="
echo "Step 1: Generating raw judge files..."
echo "=========================================="
"${generate_judge_script}" --results-file-path "$results_file_path"

if [ $? -ne 0 ]; then
    echo "Error: Failed to generate raw judge files"
    exit 1
fi

# Derive the raw file path from results file path
# The Python script replaces "benchmark_" with "judge_" and outputs to raw_files/
results_filename=$(basename "$results_file_path")
raw_filename="${results_filename/benchmark_/judge_}"
raw_file_path="raw_files/${raw_filename}"

# Check if raw file was generated
if [ ! -f "$raw_file_path" ]; then
    echo "Error: Expected raw file not found: $raw_file_path"
    exit 1
fi

# Step 2: Create jury batches
echo ""
echo "=========================================="
echo "Step 2: Creating jury batches..."
echo "=========================================="
"${create_jury_script}" --raw-file-path "$raw_file_path"

if [ $? -ne 0 ]; then
    echo "Error: Failed to create jury batches"
    exit 1
fi

echo ""
echo "=========================================="
echo "Done! Jury batches prepared successfully."
echo "=========================================="
