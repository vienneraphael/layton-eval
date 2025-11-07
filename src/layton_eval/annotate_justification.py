import base64
import json
import random
from io import BytesIO

import streamlit as st
from PIL import Image
from streamlit_shortcuts import shortcut_button

from layton_eval.settings import settings

st.set_page_config(page_title="Annotate Justification", page_icon="🧩", layout="wide")

st.title("🧩 Annotate Justification")
st.markdown("Annotate the justification for the answer.")


@st.cache_data
def load_data():
    data = []
    with open(settings.root_dir / "datasets" / "layton_eval.jsonl", "r") as f:
        for line in f:
            data.append(json.loads(line))
    return data


def save_annotation(row_data):
    """Save the current row to the annotations file."""
    annotations_dir = settings.root_dir / "annotations" / "justification"
    annotations_dir.mkdir(exist_ok=True)

    annotations_file = annotations_dir / "justification.jsonl"

    with open(annotations_file, "a") as f:
        json.dump(row_data, f)
        f.write("\n")


def read_annotated_ids():
    annotations_dir = settings.root_dir / "annotations" / "justification"
    annotations_file = annotations_dir / "justification.jsonl"
    if not annotations_file.exists():
        return []
    with open(annotations_file, "r") as f:
        return [json.loads(line)["id"] for line in f]


def load_generated_justifications() -> list[str]:
    generated_justifications_dir = settings.root_dir / "results"
    generated_justifications_file = generated_justifications_dir / "justification.jsonl"
    if not generated_justifications_file.exists():
        return []
    with open(generated_justifications_file, "r") as f:
        return [json.loads(line)["answer"] for line in f]


data = load_data()
generated_justifications = load_generated_justifications()

if "annotated_ids" not in st.session_state:
    st.session_state.annotated_ids = read_annotated_ids()

if "current_idx" not in st.session_state:
    st.session_state.current_idx = random.randint(0, len(data) - 1)
    while data[st.session_state.current_idx]["id"] in st.session_state.annotated_ids:
        st.session_state.current_idx = random.randint(0, len(data) - 1)

st.markdown(f"**Total entries:** {len(data)}")

selected_row = data[st.session_state.current_idx]

st.markdown(f"**ID:** `{selected_row.get('id', 'N/A')}`")

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.subheader("Image")
    # Display image if available
    if "img" in selected_row and selected_row["img"]:
        try:
            img_data = base64.b64decode(selected_row["img"])
            img = Image.open(BytesIO(img_data))
            st.image(img, width="stretch")
        except Exception as e:
            st.error(f"Error loading image: {e}")
    else:
        st.write("No image available")

with col2:
    st.subheader("Question (Description)")
    description = selected_row.get("description", "N/A")
    st.write(description if description else "N/A")

with col3:
    st.subheader("Answer")
    answer = selected_row.get("answer", "N/A")
    st.write(answer if answer else "N/A")

with col4:
    st.subheader("Solution")
    st.write(selected_row.get("solution", "N/A"))

st.markdown("---")

st.subheader("Generated Justification")
generated_justification = generated_justifications[st.session_state.current_idx]
st.write(generated_justification)

col1, col2 = st.columns(2)
with col1:
    if shortcut_button("Accept", "Cmd+Y"):
        selected_row["justification_correct"] = True
        selected_row["generated_justification"] = generated_justification
        save_annotation(selected_row)
        st.session_state.annotated_ids.append(selected_row["id"])
        st.success(f"Saved annotation for ID: {selected_row.get('id', 'N/A')}")
        st.session_state.current_idx = random.randint(0, len(data) - 1)
        while data[st.session_state.current_idx]["id"] in st.session_state.annotated_ids:
            st.session_state.current_idx = random.randint(0, len(data) - 1)
            selected_row = data[st.session_state.current_idx]
        st.rerun()
with col2:
    if shortcut_button("Reject", "Cmd+N"):
        selected_row["justification_correct"] = False
        selected_row["generated_justification"] = generated_justification
        save_annotation(selected_row)
        st.session_state.annotated_ids.append(selected_row["id"])
        st.success(f"Saved annotation for ID: {selected_row.get('id', 'N/A')}")
        st.session_state.current_idx = random.randint(0, len(data) - 1)
        while data[st.session_state.current_idx]["id"] in st.session_state.annotated_ids:
            st.session_state.current_idx = random.randint(0, len(data) - 1)
            selected_row = data[st.session_state.current_idx]
        st.rerun()
