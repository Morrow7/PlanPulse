import * as vscode from 'vscode';
import { TaskManager } from './taskManager';
import { TaskProvider, TaskTreeItem } from './taskProvider';

let myStatusBarItem: vscode.StatusBarItem;
export function activate(context: vscode.ExtensionContext) {
	console.log('PlanPulse is active!');

	
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	// 为状态栏项目注册命令，点击时聚焦到计划视图
	myStatusBarItem.command = 'planpulse.planView.focus';
	// 将状态栏项目添加到订阅列表，确保在扩展停用时被正确释放
	context.subscriptions.push(myStatusBarItem);
	// 创建任务管理器实例，传入扩展上下文
	const taskManager = new TaskManager(context);

	// 创建两个 Provider，分别过滤 'plan' 和 'todo'
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
			updateStatusBarItem();

			if (!title) { return; }


			const timeStr = await vscode.window.showInputBox({
				placeHolder: '多少时间后截止？(支持 m/h)',
				prompt: '例如：30, 30m, 1h, 1.5小时',
				validateInput: (value) => {
					// 正则：数字开头，可选的小数点，后面跟 m/min/分钟 或 h/hour/小时，或者不跟单位
					return /^(\d+(\.\d+)?)\s*(m|min|分钟|h|hour|小时)?$/i.test(value)
						? null
						: '请输入有效的时间，例如：30, 30m, 1h';
				}
			});

			if (!timeStr) { return; }

			
			let minutes = 0;
			// 匹配数字部分和单位部分
			const match = timeStr.match(/^(\d+(\.\d+)?)\s*(m|min|分钟|h|hour|小时)?$/i);

			if (match) {
				const num = parseFloat(match[1]); // 获取数字部分
				const unit = match[3]; // 获取单位部分

				if (!unit || /^m|min|分钟$/i.test(unit)) {
					// 默认为分钟，或者单位是分钟
					minutes = num;
				} else if (/^h|hour|小时$/i.test(unit)) {
					// 单位是小时
					minutes = num * 60;
				}
			}

			const deadline = new Date(Date.now() + minutes * 60000);

			await taskManager.addTask(title, deadline, 'plan'); // 明确指定为 'plan'
			updateStatusBarItem();
			vscode.window.showInformationMessage(`已添加计划：${title}`);
		})
	);

	
	context.subscriptions.push(
		vscode.commands.registerCommand('planpulse.addTodo', async () => {
			const title = await vscode.window.showInputBox({
				placeHolder: '请输入待办事项',
				prompt: '例如：回复邮件'
			});

			if (!title) { return; }

			// 待办事项默认给个 1 小时或者不设时间？这里为了统一逻辑，暂时也让用户输个时间，或者默认久一点
			// 简单起见，这里复用时间输入逻辑，或者我们可以简化待办不需要时间（但这需要改 Task 结构支持可选 deadline）
			// 为了保持一致性，我们还是让用户输入个截止时间，或者默认 24 小时

			const timeStr = await vscode.window.showInputBox({
				placeHolder: '多少时间后截止？(支持 m/h)',
				prompt: '例如：30, 30m, 1h (默认 1小时)',
			});

			let minutes = 60; // 默认 1 小时
			if (timeStr) {
				// 解析时间 (复用之前的逻辑)
				const match = timeStr.match(/^(\d+(\.\d+)?)\s*(m|min|分钟|h|hour|小时)?$/i);
				if (match) {
					const num = parseFloat(match[1]);
					const unit = match[3];
					if (!unit || /^m|min|分钟$/i.test(unit)) { minutes = num; }
					else if (/^h|hour|小时$/i.test(unit)) { minutes = num * 60; }
				}
			}

			const deadline = new Date(Date.now() + minutes * 60000);

			await taskManager.addTask(title, deadline, 'todo'); // 明确指定为 'todo'
			updateStatusBarItem();
			vscode.window.showInformationMessage(`已添加待办：${title}`);
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
		taskProvider.refresh();

	}, 60000);



	context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() { }
