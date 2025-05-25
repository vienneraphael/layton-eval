import os
import pandas as pd
import streamlit as st
from datasets import load_dataset

tab1, tab2, tab3 = st.tabs(["Benchmark", "Data viz", "Data explorer"])

with tab1:
    
    st.title("Professor Layton LLM Benchmark")
    
    st.caption("Only text questions")
    data = {
        "provider": ["Open AI", "Open AI", "Open AI", "Mistral"],
        "models": ["o3", "o4-mini", "GPT-4o", "Medium 3"],
        "release": ["2025-04-16", "2025-04-16", "2025-04-16", "2025-04-16"],
        "accuracy": [0.85, 0.90, 0.88, 0.56],
        "pika": [30000, 34000, 23000, 45000],
        "cost": [0.10, 0.15, 0.08, 0.3],
        "speed": [120, 100, 150, 455]
    }
    
    df = pd.DataFrame(data)
    st.dataframe(df)
    
    st.caption("Only text questions with hints")
    data = {
        "provider": ["Open AI", "Open AI", "Open AI", "Mistral"],
        "models": ["o3", "o4-mini", "GPT-4o", "Pixtral Large"],
        "release": ["2025-04-16", "2025-04-16", "2025-04-16", "2025-04-16"],
        "0-hint accuracy": [0.85, 0.90, 0.88, 0.56],
        "2-hint accuracy": [0.85, 0.90, 0.88, 0.56],
        "3-hint accuracy": [0.85, 0.90, 0.88, 0.56],
        "4-hint accuracy": [0.85, 0.90, 0.88, 0.56],
    }
    
    df = pd.DataFrame(data)
    st.dataframe(df)
    
    st.caption("Text and image questions")
    data = {
        "provider": ["Open AI", "Open AI", "Open AI", "Mistral"],
        "models": ["o3", "o4-mini", "GPT-4o", "Pixtral Large"],
        "release": ["2025-04-16", "2025-04-16", "2025-04-16", "2025-04-16"],
        "accuracy": [0.85, 0.90, 0.88, 0.56],
        "pika": [30000, 34000, 23000, 45000],
        "cost": [0.10, 0.15, 0.08, 0.3],
        "speed": [120, 100, 150, 455]
    }
    
    df = pd.DataFrame(data)
    st.dataframe(df)
    
    st.caption("Text and image questions with hints")
    data = {
        "provider": ["Open AI", "Open AI", "Open AI", "Mistral"],
        "models": ["o3", "o4-mini", "GPT-4o", "Pixtral Large"],
        "release": ["2025-04-16", "2025-04-16", "2025-04-16", "2025-04-16"],
        "0-hint accuracy": [0.85, 0.90, 0.88, 0.56],
        "2-hint accuracy": [0.85, 0.90, 0.88, 0.56],
        "3-hint accuracy": [0.85, 0.90, 0.88, 0.56],
        "4-hint accuracy": [0.85, 0.90, 0.88, 0.56],
    }
    
    df = pd.DataFrame(data)
    st.dataframe(df)


with tab2:

    dataset = load_dataset("cmenasse/layton")
    df = dataset.to_pandas()
    
    # Show the table
    st.dataframe(df)
       

with tab3:

    st.markdown("This is an example of a third tab.")