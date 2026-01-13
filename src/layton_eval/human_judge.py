#!/usr/bin/env python3
"""
Human annotation interface for Layton Eval predictions.

Usage: uv run streamlit run src/layton_eval/human_judge.py -- --pattern "benchmark_.*\\.jsonl"
"""

import argparse
import json
import random
from collections import Counter
from pathlib import Path

import streamlit as st

# Constants - paths relative to project root (two levels up from this file)
PROJECT_ROOT = Path(__file__).parent.parent.parent
RESULTS_DIR = PROJECT_ROOT / "results"
DATASET_PATH = PROJECT_ROOT / "datasets" / "layton_eval.jsonl"
ANNOTATIONS_PATH = PROJECT_ROOT / "annotations.jsonl"


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Human annotation interface")
    parser.add_argument(
        "--pattern",
        type=str,
        default=r"benchmark_*.jsonl",
        help="Regex pattern to match result files (default: benchmark_*.jsonl)",
    )
    return parser.parse_args()


def load_riddle_data() -> dict[str, dict]:
    """Load layton_eval.jsonl as id -> riddle_data dict."""
    riddles = {}
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        for line in f:
            data = json.loads(line.strip())
            riddles[data["id"]] = data
    return riddles


def load_predictions(pattern: str) -> list[dict]:
    """Load all predictions matching the pattern from results folder."""
    predictions = []

    for file_path in RESULTS_DIR.glob(pattern):
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                pred = json.loads(line.strip())
                # Parse the answer field as JSON to extract answer and justification
                try:
                    answer_data = json.loads(pred["answer"])
                    pred["parsed_answer"] = answer_data.get("answer", "")
                    pred["parsed_justification"] = answer_data.get("justification", "")
                except (json.JSONDecodeError, KeyError):
                    pred["parsed_answer"] = pred.get("answer", "")
                    pred["parsed_justification"] = ""

                # Extract provider from file name (e.g., benchmark_anthropic_... -> anthropic)
                parts = file_path.stem.split("_")
                if len(parts) >= 2:
                    pred["provider"] = parts[1]
                else:
                    pred["provider"] = "unknown"

                pred["source_file"] = file_path.name
                predictions.append(pred)

    return predictions


def load_annotations() -> dict[str, dict]:
    """Load existing annotations as (riddle_id, source_file) -> annotation dict."""
    annotations = {}
    if ANNOTATIONS_PATH.exists():
        with open(ANNOTATIONS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    ann = json.loads(line.strip())
                    key = (ann["riddle_id"], ann["source_file"])
                    annotations[key] = ann
    return annotations


def load_jury_scores() -> dict[tuple[str, str], dict]:
    """
    Load jury scores from all jury_*.jsonl files.

    Returns:
        A dict mapping (jury_file, custom_id) -> jury score dict
        Each jury score dict contains: answer_correctness, justification_correctness, both_correctness
    """
    jury_scores: dict[tuple[str, str], dict] = {}

    for file_path in RESULTS_DIR.glob("jury_*.jsonl"):
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line.strip())
                    custom_id = data.get("custom_id", "")
                    if custom_id:
                        key = (file_path.name, custom_id)
                        jury_scores[key] = {
                            "answer_correctness": data.get("answer_correctness", 1.0),
                            "justification_correctness": data.get("justification_correctness", 1.0),
                            "both_correctness": data.get("both_correctness", 1.0),
                        }

    return jury_scores


def get_jury_score_for_prediction(
    jury_scores: dict[tuple[str, str], dict],
    riddle_id: str,
    source_file: str,
) -> dict | None:
    """
    Get the jury score for a specific prediction.

    Maps the prediction source file (benchmark_*) to the corresponding jury file (jury_*).

    Returns:
        The jury score dict if found, None otherwise.
    """
    # Convert benchmark file name to jury file name
    # e.g., benchmark_openai_gpt-5-1_llm_hints_0.jsonl -> jury_openai_gpt-5-1_llm_hints_0.jsonl
    jury_file = source_file.replace("benchmark_", "jury_")

    return jury_scores.get((jury_file, riddle_id))


def save_annotation(annotation: dict) -> None:
    """Append a new annotation to the annotations file."""
    with open(ANNOTATIONS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(annotation) + "\n")


def get_annotation_stats(annotations: dict, predictions: list) -> dict:
    """Compute annotation statistics for sampling."""
    # Count annotations per riddle
    riddle_counts: Counter = Counter()
    provider_counts: Counter = Counter()

    for (riddle_id, _source_file), ann in annotations.items():
        riddle_counts[riddle_id] += 1
        provider_counts[ann.get("provider", "unknown")] += 1

    # Count total predictions per riddle and provider
    all_riddles: set = set()
    all_providers: set = set()
    for pred in predictions:
        riddle_id = pred.get("custom_id", "")
        if riddle_id:
            all_riddles.add(riddle_id)
        all_providers.add(pred["provider"])

    return {
        "riddle_counts": riddle_counts,
        "provider_counts": provider_counts,
        "all_riddles": all_riddles,
        "all_providers": all_providers,
    }


def select_next_prediction(
    predictions: list[dict],
    annotations: dict[tuple[str, str], dict],
) -> dict | None:
    """
    Select the next prediction to annotate.

    Strategy (two-step selection for balanced coverage):
    1. Choose a riddle randomly among those with lowest annotation count
    2. For that riddle, choose a provider randomly among those with lowest annotation count

    This works because every provider has predictions on every riddle.
    """
    # Filter out already annotated
    unannotated = [
        p for p in predictions if (p.get("custom_id", ""), p["source_file"]) not in annotations
    ]

    if not unannotated:
        return None

    # Get stats
    stats = get_annotation_stats(annotations, predictions)
    riddle_counts = stats["riddle_counts"]
    provider_counts = stats["provider_counts"]

    # Group unannotated predictions by riddle
    by_riddle: dict[str, list[dict]] = {}
    for pred in unannotated:
        riddle_id = pred.get("custom_id", "")
        if riddle_id not in by_riddle:
            by_riddle[riddle_id] = []
        by_riddle[riddle_id].append(pred)

    # Step 1: Find riddles with lowest annotation count
    riddle_scores = [(riddle_counts.get(rid, 0), rid) for rid in by_riddle.keys()]
    min_riddle_count = min(score for score, _ in riddle_scores)
    candidate_riddles = [rid for score, rid in riddle_scores if score == min_riddle_count]

    # Randomly select one riddle
    selected_riddle = random.choice(candidate_riddles)

    # Step 2: Among predictions for that riddle, find providers with lowest annotation count
    riddle_predictions = by_riddle[selected_riddle]
    provider_scores = [
        (provider_counts.get(pred["provider"], 0), pred) for pred in riddle_predictions
    ]
    min_provider_count = min(score for score, _ in provider_scores)
    candidate_predictions = [pred for score, pred in provider_scores if score == min_provider_count]

    # Randomly select one prediction
    return random.choice(candidate_predictions)


def display_riddle_info(riddle: dict) -> None:
    """Display riddle information in the UI."""
    st.markdown("### 📚 Riddle Information")

    col1, col2 = st.columns([2, 1])

    with col1:
        st.markdown(f"**ID:** `{riddle.get('id', 'N/A')}`")
        st.markdown(f"**Category:** {riddle.get('category', 'N/A')}")
        st.markdown(f"**Picarats:** {riddle.get('picarats', 'N/A')}")

        url = riddle.get("url", "")
        if url:
            st.markdown(f"**URL:** [{url}]({url})")

    with col2:
        # Display image if available
        img_data = riddle.get("img")
        if img_data:
            try:
                st.image(f"data:image/jpeg;base64,{img_data}", caption="Riddle Image", width=200)
            except Exception:
                st.warning("Could not display image")

    st.markdown("---")

    # Question
    st.markdown("#### ❓ Question")
    st.markdown(riddle.get("description", "N/A"))


def display_hints(riddle: dict) -> None:
    """Display riddle hints in an expander."""
    with st.expander("💡 Hints", expanded=False):
        hints = [
            ("First Hint", riddle.get("first_hint")),
            ("Second Hint", riddle.get("second_hint")),
            ("Third Hint", riddle.get("third_hint")),
            ("Special Hint", riddle.get("special_hint")),
        ]
        for name, hint in hints:
            if hint:
                st.markdown(f"**{name}:** {hint}")


def display_solution(riddle: dict) -> None:
    """Display riddle solution and answer."""
    st.markdown("#### ✅ Ground Truth")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("**Answer:**")
        st.info(riddle.get("answer", "N/A"))

    with col2:
        st.markdown("**Solution:**")
        st.success(riddle.get("solution", "N/A"))


def display_prediction(prediction: dict) -> None:
    """Display prediction information."""
    st.markdown("### 🤖 Model Prediction")
    st.markdown(f"**Source:** `{prediction.get('source_file', 'N/A')}`")
    st.markdown(f"**Model:** `{prediction.get('model', 'N/A')}`")
    st.markdown(f"**Provider:** `{prediction.get('provider', 'N/A')}`")


def display_jury_warning(
    jury_scores: dict[tuple[str, str], dict],
    riddle_id: str,
    source_file: str,
) -> None:
    """Display a warning if the jury for this prediction's model has justification_correctness < 1.0."""
    score = get_jury_score_for_prediction(jury_scores, riddle_id, source_file)

    if score is not None:
        just_corr = score.get("justification_correctness", 1.0)
        if just_corr < 1.0:
            st.warning(f"⚠️ **Jury Disagreement on Justification!** Score: **{just_corr:.0%}**")


def display_comparison(riddle: dict, prediction: dict) -> None:
    """Display side-by-side comparison for efficient annotation."""
    st.markdown("---")
    st.markdown("## 📋 Comparison View")

    # Answer comparison
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("#### 🎯 Ground Truth Answer")
        st.info(riddle.get("answer", "N/A"))

    with col2:
        st.markdown("#### 🤖 Predicted Answer")
        st.warning(prediction.get("parsed_answer", "N/A"))

    st.markdown("---")

    # Justification comparison with hints
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("#### 📖 Solution & Hints")
        st.markdown(f"**Solution:** {riddle.get('solution', 'N/A')}")
        display_hints(riddle)

    with col2:
        st.markdown("#### 💭 Model Justification")
        justification = prediction.get("parsed_justification", "N/A")
        st.markdown(justification)


def main():
    st.set_page_config(
        page_title="Layton Eval - Human Judge",
        page_icon="🔍",
        layout="wide",
    )

    # Parse args (handle Streamlit's argument passing)
    import sys

    # Find -- in argv and get args after it
    try:
        sep_idx = sys.argv.index("--")
        args_to_parse = sys.argv[sep_idx + 1 :]
    except ValueError:
        args_to_parse = []

    parser = argparse.ArgumentParser()
    parser.add_argument("--pattern", type=str, default=r"benchmark_*.jsonl")
    args = parser.parse_args(args_to_parse)

    st.title("🔍 Layton Eval - Human Annotation Interface")

    # Sidebar for stats and controls
    with st.sidebar:
        st.header("📊 Statistics")

        # Load data
        with st.spinner("Loading data..."):
            riddles = load_riddle_data()
            predictions = load_predictions(args.pattern)
            annotations = load_annotations()
            jury_scores = load_jury_scores()

        st.metric("Total Riddles", len(riddles))
        st.metric("Total Predictions", len(predictions))
        st.metric("Annotations Done", len(annotations))

        # Store jury_scores in session state for use in main content
        st.session_state["jury_scores"] = jury_scores

        # Progress
        if predictions:
            progress = len(annotations) / len(predictions)
            st.progress(progress)
            st.caption(f"Progress: {progress:.1%}")

        st.markdown("---")

        # Stats breakdown
        stats = get_annotation_stats(annotations, predictions)

        with st.expander("Riddle Coverage"):
            for riddle_id, count in sorted(stats["riddle_counts"].items())[:10]:
                st.text(f"{riddle_id}: {count}")
            if len(stats["riddle_counts"]) > 10:
                st.text("...")

        with st.expander("Provider Coverage"):
            for provider, count in stats["provider_counts"].items():
                st.text(f"{provider}: {count}")

        st.markdown("---")

        # Manual navigation
        st.header("🔧 Controls")
        if st.button("🔄 Get Next Sample"):
            if "current_prediction" in st.session_state:
                del st.session_state["current_prediction"]
            st.rerun()

        if st.button("🗑️ Skip Current"):
            if "current_prediction" in st.session_state:
                del st.session_state["current_prediction"]
            st.rerun()

    # Main content
    if not predictions:
        st.error(f"No predictions found matching pattern: `{args.pattern}`")
        st.info(f"Looking in: {RESULTS_DIR}")
        return

    # Select or get current prediction
    if "current_prediction" not in st.session_state:
        selected = select_next_prediction(predictions, annotations)
        if selected is None:
            st.success("🎉 All predictions have been annotated!")
            return
        st.session_state["current_prediction"] = selected

    prediction = st.session_state["current_prediction"]

    # Get corresponding riddle
    riddle_id = prediction.get("custom_id", "")
    riddle = riddles.get(riddle_id)

    if not riddle:
        st.error(f"Riddle not found: {riddle_id}")
        if st.button("Skip and get next"):
            del st.session_state["current_prediction"]
            st.rerun()
        return

    # Display riddle info
    display_riddle_info(riddle)

    # Display jury disagreement warning if applicable
    jury_scores = st.session_state.get("jury_scores", {})
    display_jury_warning(jury_scores, riddle_id, prediction["source_file"])

    # Display comparison view for efficient annotation
    display_comparison(riddle, prediction)

    st.markdown("---")

    # Annotation interface
    st.markdown("## ✍️ Annotation")

    col1, col2, col3 = st.columns([1, 1, 2])

    with col1:
        st.markdown("### Answer Correct?")
        answer_correct = st.radio(
            "Is the predicted answer correct?",
            options=["Yes", "No"],
            key="answer_correct",
            horizontal=True,
            label_visibility="collapsed",
        )

    with col2:
        st.markdown("### Justification Correct?")
        justification_correct = st.radio(
            "Is the justification/reasoning correct?",
            options=["Yes", "No"],
            key="justification_correct",
            horizontal=True,
            label_visibility="collapsed",
        )

    with col3:
        st.markdown("### Notes (optional)")
        notes = st.text_area(
            "Additional notes",
            key="notes",
            height=68,
            label_visibility="collapsed",
        )

    st.markdown("---")

    # Quick annotation buttons with keyboard shortcuts
    st.markdown("### ⚡ Quick Annotation (use keyboard shortcuts)")

    col1, col2, col3, col4 = st.columns(4)

    def submit_annotation(ans_correct: bool, just_correct: bool) -> None:
        """Save annotation and move to next."""
        annotation = {
            "riddle_id": riddle_id,
            "source_file": prediction["source_file"],
            "model": prediction.get("model", ""),
            "provider": prediction.get("provider", ""),
            "custom_id": prediction.get("custom_id", ""),
            "is_answer_correct": ans_correct,
            "is_justification_correct": just_correct,
            "notes": notes,
        }
        save_annotation(annotation)
        st.success("Annotation saved!")
        del st.session_state["current_prediction"]
        st.rerun()

    with col1:
        if st.button(
            "✅ Both Correct (y)",
            shortcut="y",
            type="primary",
            use_container_width=True,
        ):
            submit_annotation(True, True)

    with col2:
        if st.button(
            "❌ Both Wrong (n)",
            shortcut="n",
            use_container_width=True,
        ):
            submit_annotation(False, False)

    with col3:
        if st.button(
            "⚠️ Answer Only (a)",
            shortcut="a",
            use_container_width=True,
        ):
            submit_annotation(True, False)

    with col4:
        if st.button(
            "⏭️ Skip (s)",
            shortcut="s",
            use_container_width=True,
        ):
            del st.session_state["current_prediction"]
            st.rerun()

    st.markdown("---")

    # Manual submit with custom selection
    st.markdown("### 📝 Manual Annotation")
    if st.button("✅ Submit Annotation", type="primary"):
        submit_annotation(answer_correct == "Yes", justification_correct == "Yes")

    # Keyboard shortcuts hint
    st.markdown("---")
    st.caption("💡 **Keyboard Shortcuts:**")
    st.caption("- `y`: Both correct")
    st.caption("- `n`: Both wrong")
    st.caption("- `a`: Answer correct only")
    st.caption("- `s`: Skip current")


if __name__ == "__main__":
    main()
