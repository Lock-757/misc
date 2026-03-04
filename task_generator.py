
import random
import os

# Path to store tasks
TASK_FILE = "/app/tasks.txt"

def load_tasks():
    """Load tasks from a file. If file doesn't exist, return a default list of tasks."""
    if os.path.exists(TASK_FILE):
        with open(TASK_FILE, 'r') as file:
            tasks = [line.strip() for line in file if line.strip()]
        return tasks
    else:
        # Default tasks if file doesn't exist
        return [
            "Optimize a piece of code in the project.",
            "Write documentation for a recent feature.",
            "Create a new utility script for automation.",
            "Review and debug an existing module.",
            "Propose a new feature or improvement for the system."
        ]

def save_tasks(tasks):
    """Save tasks to a file."""
    with open(TASK_FILE, 'w') as file:
        for task in tasks:
            file.write(task + "\n")

def add_task(task):
    """Add a new task to the list."""
    tasks = load_tasks()
    if task not in tasks:
        tasks.append(task)
        save_tasks(tasks)
        return f"Task '{task}' added successfully."
    else:
        return f"Task '{task}' already exists."

def get_task():
    """Get a random task from the list."""
    tasks = load_tasks()
    if not tasks:
        return "No tasks available. Please add some tasks first."
    return random.choice(tasks)

def list_tasks():
    """List all available tasks."""
    tasks = load_tasks()
    if not tasks:
        return "No tasks available."
    return "\n".join([f"{i+1}. {task}" for i, task in enumerate(tasks)])

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        if command == "add" and len(sys.argv) > 2:
            task = " ".join(sys.argv[2:])
            print(add_task(task))
        elif command == "get":
            print(get_task())
        elif command == "list":
            print(list_tasks())
        else:
            print("Usage: python task_generator.py [add <task description>|get|list]")
    else:
        print("Usage: python task_generator.py [add <task description>|get|list]")
