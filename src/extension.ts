import * as vscode from 'vscode';
import { TaskManager } from './taskManager';
import { TaskProvider, TaskTreeItem } from './taskProvider';

let myStatusBarItem: vscode.StatusBarItem;
export function activate(context: vscode.ExtensionContext) {
	console.log('PlanPulse is active!');

	
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	myStatusBarItem.command = 'planpulse.planView.focus';
	context.subscriptions.push(myStatusBarItem);
	const taskManager = new TaskManager(context);


	const planProvider = new TaskProvider(taskManager, 'plan');
	const todoProvider = new TaskProvider(taskManager, 'todo');

	const updateStatusBarItem = () => {
		const tasks = taskManager.getTasks();
		const pending = tasks.filter(task => !task.completed);

		if (pending.length > 0) {
			pending.sort((a, b) => a.deadline - b.deadline);
			const first = pending[0];
			const diff = Math.ceil((first.deadline - Date.now()) / 60000);

			myStatusBarItem.text = `$(clock)${first.title}(${diff}m)`; // 加个 m 单位更清楚
			myStatusBarItem.show();
		} else {
			myStatusBarItem.hide();
		}
	};

	vscode.window.registerTreeDataProvider('planpulse.planView', planProvider);
	vscode.window.registerTreeDataProvider('planpulse.todoView', todoProvider); // 注册待办视图


	context.subscriptions.push(
		vscode.commands.registerCommand('planpulse.addTask', async () => {
			const title = await vscode.window.showInputBox({
				placeHolder: '请输入计划标题',
				prompt: '例如：完成需求文档'
			});
			if (!title) return;

			const timeStr = await vscode.window.showInputBox({
				placeHolder: '请输入截止时间',
				prompt: '支持格式：30m(30分钟), 1h(1小时), 2025-10-01, 10-01 18:00',
				validateInput: (value) => {
					if (!parseDeadline(value)) {
						return '请输入有效的时间格式，例如：30m, 1h, 2025-10-01';
					}
					return null;
				}
			});

			if (!timeStr) return;

			// 直接使用 parseDeadline，不要再有任何旧的 minutes 计算逻辑
			const deadline = parseDeadline(timeStr);
			if (!deadline) return;

			await taskManager.addTask(title, deadline, 'plan');
			updateStatusBarItem();
			const timeString=deadline.toLocaleString();
			vscode.window.showInformationMessage(`已添加计划：${title} (截至:${timeString})`);
		})
	);

	
	context.subscriptions.push(
		vscode.commands.registerCommand('planpulse.addTodo', async () => {
			const title = await vscode.window.showInputBox({
				placeHolder: '请输入待办事项',
				prompt: '例如：回复邮件'
			});
			if (!title) return;

			const timeStr = await vscode.window.showInputBox({
				placeHolder: '请输入截止时间 (可选，默认 1小时)',
				prompt: '例如：30m, 1h, 2025-10-01',
			});

			let deadline: Date;
			if (timeStr && parseDeadline(timeStr)) {
				deadline = parseDeadline(timeStr)!;
			} else {
				// 默认 1 小时后
				deadline = new Date(Date.now() + 60 * 60000);
			}

			await taskManager.addTask(title, deadline, 'todo');
			updateStatusBarItem();
			const timeString=deadline.toLocaleString();
			vscode.window.showInformationMessage(`已添加待办：${title} (截至:${timeString})`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('planpulse.completeTask', async (item: TaskTreeItem) => {
			if (item && item.task) {
				await taskManager.completeTask(item.task.id);
				vscode.window.showInformationMessage(`恭喜！完成了任务：${item.task.title}`);
			}
		})
	);


	context.subscriptions.push(
		vscode.commands.registerCommand('planpulse.deleteTask', async (item: TaskTreeItem) => {
			if (item && item.task) {
				const confirm = await vscode.window.showWarningMessage(
					`确定要删除任务“${item.task.title}”吗？`,
					{ modal: true },
					'确定'
				);

				updateStatusBarItem();

				if (confirm === '确定') {
					await taskManager.deleteTask(item.task.id);
				}
			}
		})
	);


	const interval = setInterval(() => {
		const tasks = taskManager.getTasks();
		const now = Date.now();

		tasks.forEach(task => {
			if (!task.completed && task.deadline < now) {


				vscode.window.showWarningMessage(
					` 任务过期警告：${task.title} 已超时！`,
					'去完成', '推迟 10 分钟'
				).then(selection => {
					if (selection === '去完成') {
						taskManager.completeTask(task.id);
					} else if (selection === '推迟 10 分钟') {

						vscode.window.showInformationMessage('加油，不能只制定不行动哦！');
					}
				});
			}
		});

		updateStatusBarItem();
		planProvider.refresh();
		todoProvider.refresh();

	}, 60000);

   
	context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function parseDeadline(input: string): Date | undefined {
	const now = new Date();

	// 1. 尝试匹配相对时间 (30m, 2h)
	const relativeMatch = input.match(/^(\d+(\.\d+)?)\s*(m|min|分钟|h|hour|小时)?$/i);
	if (relativeMatch) {
		const num = parseFloat(relativeMatch[1]);
		const unit = relativeMatch[3];
		let minutes = num;
		if (unit && /^h|hour|小时$/i.test(unit)) {
			minutes = num * 60;
		}
		return new Date(now.getTime() + minutes * 60000);
	}

	// 2. 尝试匹配日期
	const date = new Date(input);
	if (!isNaN(date.getTime())) {
		return date;
	}

	return undefined;
}

export function deactivate() { }
