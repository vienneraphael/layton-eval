#!/bin/bash

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --glob-prefix)
            glob_prefix="$2"
            shift 2
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 --glob-prefix <prefix>"
            echo "  Example: $0 --glob-prefix ./results/judge_openai"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$glob_prefix" ]; then
    echo "Error: --glob-prefix is required"
    echo "Usage: $0 --glob-prefix <prefix>"
    echo "  Example: $0 --glob-prefix ./results/judge_openai"
    exit 1
fi

# Get the directory of this script
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
compute_script="${project_root}/src/layton_eval/compute_jury_results.py"

# Check if compute_jury_results.py exists
if [ ! -f "$compute_script" ]; then
    echo "Error: compute_jury_results.py not found at $compute_script"
    exit 1
fi

echo "Running compute_jury_results.py with glob-prefix: $glob_prefix"

# Run the Python script using uv
uv run python "$compute_script" --glob-prefix "$glob_prefix"

echo "Done!"
