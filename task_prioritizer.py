
"""
Task Prioritizer Tool
Author: Devin
Purpose: Helps agents prioritize tasks based on urgency and importance.

This tool allows users to input tasks with attributes such as title, urgency, and importance.
It then calculates a priority score and outputs a sorted list of tasks to focus on.

Usage:
    Run this script with task details provided via command line or a file.
    Example: python task_prioritizer.py --task "Task 1" --urgency 5 --importance 4
    Or provide a JSON file with tasks: python task_prioritizer.py --file tasks.json
"""

import argparse
import json
import os
from typing import List, Dict

def calculate_priority(urgency: int, importance: int) -> float:
    """
    Calculate a priority score based on urgency and importance.
    Formula: Priority = (urgency * 0.6) + (importance * 0.4)
    """
    return (urgency * 0.6) + (importance * 0.4)

def prioritize_tasks(tasks: List[Dict[str, any]]) -> List[Dict[str, any]]:
    """
    Sort tasks based on their priority score.
    """
    for task in tasks:
        task['priority_score'] = calculate_priority(task.get('urgency', 0), task.get('importance', 0))
    return sorted(tasks, key=lambda x: x['priority_score'], reverse=True)

def read_tasks_from_file(file_path: str) -> List[Dict[str, any]]:
    """
    Read tasks from a JSON file.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File {file_path} not found.")
    with open(file_path, 'r') as file:
        data = json.load(file)
        if not isinstance(data, list):
            raise ValueError("JSON file must contain a list of tasks.")
        return data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Task Prioritizer Tool for agents.")
    parser.add_argument('--task', type=str, help="Title of the task.")
    parser.add_argument('--urgency', type=int, default=3, help="Urgency level (1-5, default 3).")
    parser.add_argument('--importance', type=int, default=3, help="Importance level (1-5, default 3).")
    parser.add_argument('--file', type=str, help="Path to a JSON file containing a list of tasks.")
    
    args = parser.parse_args()
    
    tasks = []
    if args.file:
        try:
            tasks = read_tasks_from_file(args.file)
            print(f"Loaded tasks from file: {args.file}")
        except (FileNotFoundError, ValueError) as e:
            print(f"Error: {e}")
            exit(1)
    elif args.task:
        tasks.append({
            "title": args.task,
            "urgency": max(1, min(5, args.urgency)),  # Ensure value is between 1 and 5
            "importance": max(1, min(5, args.importance))  # Ensure value is between 1 and 5
        })
        print(f"Added task: {args.task}")
    else:
        print("Error: Please provide either a task (--task) or a file path (--file).")
        print("Usage: python task_prioritizer.py --task \"Task Name\" --urgency 5 --importance 4")
        print("       python task_prioritizer.py --file path/to/tasks.json")
        exit(1)
    
    prioritized_tasks = prioritize_tasks(tasks)
    print("\nPrioritized Task List:")
    print("======================")
    for i, task in enumerate(prioritized_tasks, 1):
        print(f"{i}. {task['title']}")
        print(f"   Urgency: {task['urgency']}, Importance: {task['importance']}")
        print(f"   Priority Score: {task['priority_score']:.2f}")
        print("----------------------")
