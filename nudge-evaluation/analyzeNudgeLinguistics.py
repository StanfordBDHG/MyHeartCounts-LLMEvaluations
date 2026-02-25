#!/usr/bin/env python3
"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

"""
Linguistic Analysis Module for Nudge Permutations

This script performs automated linguistic analyses on generated nudges from CSV files
produced by generateNudgePermutations.ts. It extracts individual nudges (titles and bodies)
and computes various linguistic features including word count, sentiment, action-verb
frequency, temporal reference, lexical diversity, exclamation usage, and readability.
"""

import json
import sys
import argparse
import warnings
from pathlib import Path
from typing import Dict, List, Any, Optional

import pandas as pd
import spacy
import textstat
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Suppress warnings
warnings.filterwarnings('ignore')

# Load models and tools
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Error: spaCy English model 'en_core_web_sm' not found.")
    print("Please install it with: python -m spacy download en_core_web_sm")
    sys.exit(1)

analyzer = SentimentIntensityAnalyzer()

# Temporal keywords
TEMPORAL_KEYWORDS = {
    "today", "tomorrow", "tonight", "morning", "evening", "daily",
    "each day", "every day", "this week", "next week", "in 10 minutes", "routine"
}


def _try_parse_json(text: str) -> Any:
    """
    Helper to parse JSON, handling markdown blocks.
    
    Handles various formats:
    - ```json\n{...}\n```
    - json```\n{...}\n```
    - ```\n{...}\n```
    - json```{...}``` (all on one line)
    
    Args:
        text: JSON string, potentially wrapped in markdown code blocks
        
    Returns:
        Parsed JSON data, or None if parsing fails
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code blocks
        cleaned = text.strip()
        
        if "```" in cleaned:
            # Remove opening markdown block (handles both ``` and json```)
            if cleaned.startswith("```json"):
                # Case: ```json\n{...} or ```json{...}
                cleaned = cleaned[7:].lstrip()  # Remove "```json" and whitespace
            elif cleaned.startswith("json```"):
                # Case: json```{...} or json```\n{...}
                cleaned = cleaned[7:].lstrip()  # Remove "json```" and any leading whitespace
            elif cleaned.startswith("```"):
                # Case: ```\n{...} or ```{...}
                cleaned = cleaned[3:].lstrip()  # Remove "```" and whitespace
            
            # Remove closing ```
            cleaned = cleaned.rstrip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].rstrip()
            
            cleaned = cleaned.strip()
        
        return json.loads(cleaned)


def parse_llm_response(llm_response: str) -> Optional[List[Dict[str, str]]]:
    """
    Parse the JSON response from llmResponse column and extract nudges.
    
    Args:
        llm_response: JSON string containing nudges
        
    Returns:
        List of dictionaries with 'title' and 'body' keys, or None if parsing fails
    """
    if not llm_response or pd.isna(llm_response):
        return None
    
    try:
        data = _try_parse_json(llm_response)
        
        # Handle different possible JSON structures
        if isinstance(data, dict):
            if "nudges" in data:
                nudges = data["nudges"]
            elif "messages" in data:
                nudges = data["messages"]
            else:
                # Assume the dict itself is a nudge or contains nested structure
                nudges = [data] if "title" in data or "body" in data else []
        elif isinstance(data, list):
            nudges = data
        else:
            return None
        
        # Validate and extract nudges
        result = []
        for nudge in nudges:
            if isinstance(nudge, dict):
                title = nudge.get("title", "")
                body = nudge.get("body", "")
                if title or body:  # At least one field should be present
                    result.append({"title": str(title), "body": str(body)})
        
        return result if result else None
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"Warning: Error parsing llmResponse: {e}", file=sys.stderr)
        return None


def compute_features(text: str, feature_type: str = "body") -> Dict[str, Any]:
    """
    Compute linguistic features for nudge text (body or title).
    
    Features: word_count, sentiment, action_verb_frequency, temporal_reference,
    exclamation_usage, readability. Additionally includes lexical_diversity (TTR) for body.
    
    Args:
        text: The text to analyze
        feature_type: Either "body" or "title" (default: "body")
        
    Returns:
        Dictionary with feature names and values (prefixed with feature_type)
    """
    if not text or pd.isna(text):
        text = ""
    
    text = str(text)
    doc = nlp(text)
    words = [token.text for token in doc if token.is_alpha]
    
    # Word count
    word_count = len(words)
    
    # Sentiment
    sentiment_score = analyzer.polarity_scores(text)["compound"]
    
    # Action verb count (excluding aux and copula)
    # Check both token text and lemma to catch variations
    action_count = sum(
        1 for token in doc
        if token.pos_ == "VERB" and token.dep_ not in {"aux", "cop"}
    )
    
    # Temporal reference
    temporal_presence = int(
        any(ent.label_ in {"DATE", "TIME"} for ent in doc.ents) or
        any(kw in text.lower() for kw in TEMPORAL_KEYWORDS)
    )
    
    # Exclamation count
    exclam_count = text.count("!")
    
    # Readability (Flesch Reading Ease)
    readability = textstat.flesch_reading_ease(text)
    
    # Build result dictionary with appropriate prefix
    prefix = feature_type
    result: Dict[str, Any] = {
        f"{prefix}_word_count": word_count,
        f"{prefix}_sentiment": sentiment_score,
        f"{prefix}_action_verb_frequency": action_count,
        f"{prefix}_temporal_reference": temporal_presence,
        f"{prefix}_exclamation_usage": exclam_count,
        f"{prefix}_readability": readability,
    }
    
    # Type-token ratio (lexical diversity) - only for body
    if feature_type == "body":
        tokens = [token.text.lower() for token in doc if token.is_alpha]
        ttr = len(set(tokens)) / len(tokens) if tokens else 0.0
        result[f"{prefix}_lexical_diversity"] = ttr
    
    return result


def process_csv(input_file: str, output_file: Optional[str] = None) -> pd.DataFrame:
    """
    Process CSV file, extract nudges, and compute linguistic features.
    
    Args:
        input_file: Path to input CSV file
        output_file: Optional path for output file (default: data/evaluated/{input}_with_linguistics.csv)
        
    Returns:
        DataFrame with all original columns plus linguistic features
    """
    print(f"Reading CSV file: {input_file}")
    df = pd.read_csv(input_file)
    
    if "llmResponse" not in df.columns:
        raise ValueError("CSV file must contain 'llmResponse' column")
    
    print(f"Processing {len(df)} rows...")
    
    # Expand rows: one row per nudge
    expanded_rows = []
    
    for idx, row in df.iterrows():
        nudges = parse_llm_response(row.get("llmResponse", ""))
        
        if not nudges:
            # Keep row even if no nudges found, with empty feature values
            expanded_row = row.to_dict()
            expanded_row["nudge_index"] = -1
            expanded_row["title"] = ""
            expanded_row["body"] = ""
            # Add empty features
            expanded_row.update(compute_features("", feature_type="title"))
            expanded_row.update(compute_features("", feature_type="body"))
            expanded_rows.append(expanded_row)
            continue
        
        # Create one row per nudge
        for nudge_idx, nudge in enumerate(nudges):
            expanded_row = row.to_dict()
            expanded_row["nudge_index"] = nudge_idx
            expanded_row["title"] = nudge.get("title", "")
            expanded_row["body"] = nudge.get("body", "")
            
            # Compute features
            title_features = compute_features(nudge.get("title", ""), feature_type="title")
            body_features = compute_features(nudge.get("body", ""), feature_type="body")
            
            expanded_row.update(title_features)
            expanded_row.update(body_features)
            
            expanded_rows.append(expanded_row)
    
    result_df = pd.DataFrame(expanded_rows)
    
    # Reorder columns: original columns first, then nudge_index, title, body, then features
    original_cols = [col for col in df.columns if col not in ["nudge_index", "title", "body"]]
    feature_cols = [col for col in result_df.columns if col not in original_cols + ["nudge_index", "title", "body"]]
    
    column_order = original_cols + ["nudge_index", "title", "body"] + sorted(feature_cols)
    result_df = result_df[column_order]
    
    # Save to CSV
    if output_file is None:
        # Default: save to data/evaluated/ directory
        script_dir = Path(__file__).parent
        data_dir = script_dir.parent / "data" / "evaluated"
        data_dir.mkdir(parents=True, exist_ok=True)
        
        input_path = Path(input_file)
        output_file = str(data_dir / f"{input_path.stem}_with_linguistics.csv")
    
    print(f"Saving results to: {output_file}")
    result_df.to_csv(output_file, index=False)
    print(f"Saved {len(result_df)} rows to {output_file}")
    
    return result_df


def generate_summary_statistics(df: pd.DataFrame, output_file: Optional[str] = None) -> pd.DataFrame:
    """
    Generate summary statistics grouped by modelId.
    
    Args:
        df: DataFrame with linguistic features
        output_file: Optional path for summary CSV
        
    Returns:
        DataFrame with summary statistics
    """
    if "modelId" not in df.columns:
        print("Warning: 'modelId' column not found. Cannot generate summary statistics.")
        return pd.DataFrame()
    
    # Filter out rows with no valid nudges (nudge_index == -1)
    valid_df = df[df["nudge_index"] >= 0].copy()
    
    if len(valid_df) == 0:
        print("Warning: No valid nudges found for summary statistics.")
        return pd.DataFrame()
    
    # Feature columns to summarize
    feature_cols = [col for col in df.columns if col.startswith(("title_", "body_"))]
    
    summary_data = []
    
    for model_id in valid_df["modelId"].unique():
        model_df = valid_df[valid_df["modelId"] == model_id]
        
        summary = {"modelId": model_id}
        
        for col in feature_cols:
            values = model_df[col].dropna()
            if len(values) > 0:
                summary[f"{col}_mean"] = values.mean()
                summary[f"{col}_std"] = values.std()
                summary[f"{col}_min"] = values.min()
                summary[f"{col}_max"] = values.max()
            else:
                summary[f"{col}_mean"] = 0.0
                summary[f"{col}_std"] = 0.0
                summary[f"{col}_min"] = 0.0
                summary[f"{col}_max"] = 0.0
        
        summary_data.append(summary)
    
    summary_df = pd.DataFrame(summary_data)
    
    # Round numeric columns
    numeric_cols = summary_df.select_dtypes(include=['float64']).columns
    summary_df[numeric_cols] = summary_df[numeric_cols].round(2)
    
    if output_file is None:
        # Default: save to data/evaluated/ directory
        script_dir = Path(__file__).parent
        data_dir = script_dir.parent / "data" / "evaluated"
        data_dir.mkdir(parents=True, exist_ok=True)
        output_file = str(data_dir / "summary_linguistics_by_model.csv")
    
    print(f"Saving summary statistics to: {output_file}")
    summary_df.to_csv(output_file, index=False)
    print(f"Saved summary for {len(summary_df)} models")
    
    return summary_df


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Perform linguistic analysis on nudge permutations CSV files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze a file (typically located in ../data/generated/)
  python analyzeNudgeLinguistics.py ../data/generated/nudge_permutations_results_gpt-5_sample_2.csv
  
  # Analyze with custom output location
  python analyzeNudgeLinguistics.py input.csv --output custom_output.csv
  
  # Generate summary statistics
  python analyzeNudgeLinguistics.py input.csv --summary
  
  # Both output file and summary
  python analyzeNudgeLinguistics.py input.csv --output analyzed_results.csv --summary
        """
    )
    
    parser.add_argument(
        "input_file",
        help="Path to input CSV file from generateNudgePermutations.ts (typically located in ../data/generated/)"
    )
    
    parser.add_argument(
        "--output",
        "-o",
        help="Output file path (default: data/evaluated/{input}_with_linguistics.csv)",
        default=None
    )
    
    parser.add_argument(
        "--summary",
        "-s",
        action="store_true",
        help="Generate summary statistics CSV grouped by modelId"
    )
    
    args = parser.parse_args()
    
    # Validate input file exists
    if not Path(args.input_file).exists():
        print(f"Error: Input file not found: {args.input_file}", file=sys.stderr)
        print(f"Hint: Generated CSV files are typically in ../data/generated/", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Process CSV
        result_df = process_csv(args.input_file, args.output)
        
        # Generate summary if requested
        if args.summary:
            summary_output = None
            if args.output:
                summary_output = str(Path(args.output).parent / f"{Path(args.output).stem}_summary.csv")
            generate_summary_statistics(result_df, summary_output)
        
        print("\nAnalysis complete!")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
