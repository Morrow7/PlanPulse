import * as vscode from 'vscode';

export interface Task {
    id: string;
    title: string;
    deadline: number; 
    completed: boolean;
}

export class TaskManager {
    private static readonly STORAGE_KEY = 'planpulse.tasks';
    private _onDidChangeTasks: vscode.EventEmitter<Task[] | undefined> = new vscode.EventEmitter<Task[] | undefined>();
    readonly onDidChangeTasks: vscode.Event<Task[] | undefined> = this._onDidChangeTasks.event;
 
    constructor(private context: vscode.ExtensionContext) {}

    getTasks(): Task[] {
        return this.context.globalState.get<Task[]>(TaskManager.STORAGE_KEY) || [];
    }

    async addTask(title: string, deadline: Date): Promise<void> {
        const tasks = this.getTasks();
        const newTask: Task = {
            id: Date.now().toString(),
            title,
            deadline: deadline.getTime(),
            completed: false
        };
        tasks.push(newTask);
        await this.saveTasks(tasks);
    }

    async completeTask(id: string): Promise<void> {
        const tasks = this.getTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = true;
            await this.saveTasks(tasks);
        }
    }

    async deleteTask(id: string): Promise<void> {
        let tasks = this.getTasks();
        tasks = tasks.filter(t => t.id !== id);
        await this.saveTasks(tasks);
    }

    private async saveTasks(tasks: Task[]): Promise<void> {
        await this.context.globalState.update(TaskManager.STORAGE_KEY, tasks);
        this._onDidChangeTasks.fire(tasks);
    }
}
