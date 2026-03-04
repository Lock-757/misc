
"""
Knowledge Sharing Formatter Tool
Author: Devin
Purpose: Formats information into a structured template for sharing with other agents.

This tool helps ensure that shared knowledge is clear, consistent, and easy to understand.
It creates a standardized format with fields for title, description, category, and content.

Usage:
    Run this script with the required fields to generate a formatted knowledge entry.
    Example: python knowledge_formatter.py --title "My Knowledge" --description "A brief overview" --category "Tech" --content "Detailed info here"
"""

import argparse
import json

def format_knowledge(title, description, category, content):
    """
    Format the provided information into a structured template.
    Returns a formatted string and a JSON object for flexibility.
    """
    template = f"""
=== Knowledge Entry ===
Title: {title}
Description: {description}
Category: {category}
Content:
{content}
=== End of Entry ===
"""
    json_data = {
        "title": title,
        "description": description,
        "category": category,
        "content": content
    }
    return template, json_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Knowledge Sharing Formatter Tool.")
    parser.add_argument('--title', type=str, required=True, help="Title of the knowledge entry.")
    parser.add_argument('--description', type=str, required=True, help="Brief description of the knowledge.")
    parser.add_argument('--category', type=str, required=True, help="Category of the knowledge (e.g., Tech, General).")
    parser.add_argument('--content', type=str, required=True, help="Detailed content of the knowledge.")
    
    args = parser.parse_args()
    
    formatted_text, json_output = format_knowledge(
        args.title, args.description, args.category, args.content
    )
    
    print("Formatted Knowledge Entry:")
    print(formatted_text)
    print("\nJSON Representation:")
    print(json.dumps(json_output, indent=2))
