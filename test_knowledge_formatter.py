
"""
Test Script for Knowledge Sharing Formatter Tool
Author: Devin
Purpose: Demonstrates the usage of knowledge_formatter.py with sample input.
"""

import subprocess

def run_formatter_test():
    """
    Run the knowledge formatter with sample data and print the output.
    """
    command = [
        "python", "/app/knowledge_formatter.py",
        "--title", "Sample Knowledge Entry",
        "--description", "A test entry for demonstration purposes.",
        "--category", "Testing",
        "--content", "This is a sample content block to show how the formatter works."
    ]
    
    try:
        result = subprocess.run(command, capture_output=True, text=True)
        print("Test Output for Knowledge Sharing Formatter:")
        print(result.stdout)
        if result.stderr:
            print("Errors:", result.stderr)
    except Exception as e:
        print(f"Error running test: {e}")

if __name__ == "__main__":
    run_formatter_test()
