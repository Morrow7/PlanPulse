import * as vscode from 'vscode';
import { Task, TaskManager } from './taskManager';

export class TaskProvider implements vscode.TreeDataProvider<TaskTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskTreeItem | undefined | null | void> = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private taskManager: TaskManager) {
        this.taskManager.onDidChangeTasks(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TaskTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskTreeItem): Thenable<TaskTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const tasks = this.taskManager.getTasks();
            
            tasks.sort((a, b) => {
                const now = Date.now();
                const aOverdue = !a.completed && a.deadline < now;
                const bOverdue = !b.completed && b.deadline < now;

                if (a.completed !== b.completed) {
                    return a.completed ? 1 : -1; 
                }
                
                if (aOverdue !== bOverdue) {
                    return aOverdue ? -1 : 1; 
                }

                return a.deadline - b.deadline;
            });

            return Promise.resolve(tasks.map(task => new TaskTreeItem(task)));
        }
    }
}

export class TaskTreeItem extends vscode.TreeItem {
    constructor(public readonly task: Task) {
        super(task.title, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = `${this.formatDate(new Date(task.deadline))}`;
        
        const isOverdue = !task.completed && task.deadline < Date.now();
        
        if (task.completed) {
            this.iconPath = new vscode.ThemeIcon('check');
            this.contextValue = 'task-completed';
            this.description = '已完成';
        } else if (isOverdue) {
            this.iconPath = new vscode.ThemeIcon('warning');
            this.contextValue = 'task-overdue';
            this.description = '已过期';
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
            this.contextValue = 'task-pending';
            this.description = this.getTimeRemaining(task);
        }
    }

    private formatDate(date: Date): string {
        return date.toLocaleString();
    }

    private getTimeRemaining(task: Task): string {
        const now = Date.now();
        const diff = task.deadline - now;
        if (diff < 0) return '已过期';
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) return `${days}天${hours}小时后`;
        if (hours > 0) return `${hours}小时${minutes}分后`;
        return `${minutes}分后`;
    }
}
