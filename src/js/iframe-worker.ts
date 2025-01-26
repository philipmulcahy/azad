interface IFrameTask {
  taskType: string,
  taskId: number,
  url: string,
}

// Called from the content page the iframe will be hosted by
export function startTask(
  _taskSpec: IFrameTask
): void {
  // Create and emplace the iframe.
  //
  // Decision - do we tell the iframe what it is supposed to be doing with
  // url params (potentially confusing Amazon)
  // or do we register the task with  the background task?
}
