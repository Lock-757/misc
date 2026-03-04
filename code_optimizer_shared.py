
"""
Code Optimizer Tool (Shared Version)
Author: Devin
Purpose: Analyzes Python code for basic optimizations and suggests improvements.
This version is designed for use by multiple agents with added flexibility.

This tool currently checks for:
- Repeated code blocks that can be combined into functions or loops.
- Poor variable naming (e.g., single-letter names).
- Basic style issues (e.g., long lines).

Usage:
    Run this script with a code snippet or file path as input to get optimization suggestions.
    Example: python code_optimizer_shared.py --file path/to/your/code.py
    Or provide a code snippet directly: python code_optimizer_shared.py --snippet "your code here"
"""

import argparse
import os

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

def analyze_unused_variables(code_lines):
    """
    Check for variables that are defined but not used later in the code.
    Returns a list of suggestions.
    """
    suggestions = []
    defined_vars = {}
    used_vars = set()
    
    for i, line in enumerate(code_lines):
        stripped_line = line.strip()
        if "=" in stripped_line and not stripped_line.startswith("#"):
            var_name = stripped_line.split("=")[0].strip()
            if var_name and not var_name.startswith(" "):
                defined_vars[var_name] = i + 1
        words = stripped_line.split()
        for word in words:
            clean_word = word.strip("=+-*/()[]{}.,:")
            if clean_word in defined_vars and clean_word != "":
                used_vars.add(clean_word)
    
    for var, line_num in defined_vars.items():
        if var not in used_vars:
            suggestions.append(f"Line {line_num}: Variable '{var}' is defined but never used.")
    return suggestions

def analyze_inefficient_loops(code_lines):
    """
    Check for inefficient loop structures, such as using range(len()) instead of enumerate.
    Returns a list of suggestions.
    """
    suggestions = []
    for i, line in enumerate(code_lines):
        stripped_line = line.strip()
        if "for" in stripped_line and "range(len(" in stripped_line:
            suggestions.append(f"Line {i+1}: Inefficient loop using 'range(len())'. Consider using 'enumerate()' instead.")
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
    suggestions.extend(analyze_unused_variables(code_lines))
    suggestions.extend(analyze_inefficient_loops(code_lines))
    return suggestions

def read_code_from_file(file_path):
    """
    Read code content from a specified file.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File {file_path} not found.")
    with open(file_path, 'r') as file:
        return file.read()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Code Optimizer Tool for analyzing Python code.")
    parser.add_argument('--file', type=str, help="Path to the Python file to analyze.")
    parser.add_argument('--snippet', type=str, help="Direct code snippet to analyze.")
    
    args = parser.parse_args()
    
    if args.file:
        try:
            code_content = read_code_from_file(args.file)
            print(f"Analyzing code from file: {args.file}")
        except FileNotFoundError as e:
            print(f"Error: {e}")
            exit(1)
    elif args.snippet:
        code_content = args.snippet
        print("Analyzing provided code snippet:")
        print(args.snippet)
    else:
        print("Error: Please provide either a file path (--file) or a code snippet (--snippet).")
        print("Usage: python code_optimizer_shared.py --file path/to/code.py")
        print("       python code_optimizer_shared.py --snippet \"your code here\"")
        exit(1)
    
    suggestions = optimize_code(code_content)
    if suggestions:
        print("\nOptimization Suggestions:")
        for suggestion in suggestions:
            print(f"- {suggestion}")
    else:
        print("\nNo optimization suggestions found.")
