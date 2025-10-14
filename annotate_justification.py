import base64
import json
from io import BytesIO
from pathlib import Path

import streamlit as st
from PIL import Image
from streamlit_shortcuts import shortcut_button

st.set_page_config(page_title="Annotate Justification", page_icon="🧩", layout="wide")

st.title("🧩 Annotate Justification")
st.markdown("Annotate the justification for the answer.")


@st.cache_data
def load_data():
    data = []
    with open("layton_eval.jsonl", "r") as f:
        for line in f:
            data.append(json.loads(line))
    return data


def save_annotation(row_data):
    """Save the current row to the annotations file."""
    annotations_dir = Path("annotations")
    annotations_dir.mkdir(exist_ok=True)

    annotations_file = annotations_dir / "justification.jsonl"

    with open(annotations_file, "a") as f:
        json.dump(row_data, f)
        f.write("\n")


data = load_data()

if "current_idx" not in st.session_state:
    st.session_state.current_idx = 0

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
    st.subheader("Generated Justification")
    generated_justification = selected_row.get("generated_justification", "N/A")
    st.write(generated_justification if generated_justification else "N/A")

st.markdown("---")

btn_col1, btn_col2, btn_col3 = st.columns(3)

with btn_col1:
    if shortcut_button("Previous", "ArrowLeft"):
        if st.session_state.current_idx > 0:
            st.session_state.current_idx -= 1
            st.rerun()

with btn_col2:
    if shortcut_button("Submit", "Cmd+S"):
        save_annotation(selected_row)
        st.success(f"Saved annotation for ID: {selected_row.get('id', 'N/A')}")

with btn_col3:
    if shortcut_button("Next", "ArrowRight"):
        if st.session_state.current_idx < len(data) - 1:
            st.session_state.current_idx += 1
            st.rerun()
