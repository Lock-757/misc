
"""
Code Optimizer Tool
Author: Devin
Purpose: Analyzes Python code for basic optimizations and suggests improvements.

This tool currently checks for:
- Repeated code blocks that can be combined into functions or loops.
- Poor variable naming (e.g., single-letter names).
- Basic style issues (e.g., long lines).

Usage:
    Run this script with a code snippet or file path as input to get optimization suggestions.
"""

def analyze_repeated_code(code_lines):
    """
    Check for repeated lines of code that could be combined into a function or loop.
    Returns a list of suggestions.
    """
    suggestions = []
    line_count = len(code_lines)
    for i in range(line_count):
        for j in range(i + 1, line_count):
            if code_lines[i].strip() == code_lines[j].strip() and code_lines[i].strip() != "":
                suggestions.append(f"Repeated code at lines {i+1} and {j+1}. Consider creating a function or loop.")
    return suggestions

def analyze_variable_names(code_lines):
    """
    Check for poor variable naming conventions (e.g., single-letter names).
    Returns a list of suggestions.
    """
    suggestions = []
    for i, line in enumerate(code_lines):
        stripped_line = line.strip()
        if "=" in stripped_line and not stripped_line.startswith("#"):
            var_name = stripped_line.split("=")[0].strip()
            if len(var_name) == 1 and var_name.isalpha():
                suggestions.append(f"Line {i+1}: Single-letter variable name '{var_name}'. Consider a more descriptive name.")
    return suggestions

def analyze_line_length(code_lines):
    """
    Check for lines that are too long (over 79 characters per PEP 8).
    Returns a list of suggestions.
    """
    suggestions = []
    for i, line in enumerate(code_lines):
        if len(line.rstrip()) > 79:
            suggestions.append(f"Line {i+1}: Line exceeds 79 characters. Consider breaking it into multiple lines.")
    return suggestions

def optimize_code(code_snippet):
    """
    Main function to analyze a code snippet and return optimization suggestions.
    """
    code_lines = code_snippet.splitlines()
    suggestions = []
    suggestions.extend(analyze_repeated_code(code_lines))
    suggestions.extend(analyze_variable_names(code_lines))
    suggestions.extend(analyze_line_length(code_lines))
    return suggestions

if __name__ == "__main__":
    # Example usage with a test snippet
    test_code = """
    x = 10
    y = 20
    x = 10
    result = x + y + x + y + x + y + x + y + x + y + x + y + x + y + x + y + x + y
    z = 30
    """
    suggestions = optimize_code(test_code)
    if suggestions:
        print("Optimization Suggestions:")
        for suggestion in suggestions:
            print(f"- {suggestion}")
    else:
        print("No optimization suggestions found.")
