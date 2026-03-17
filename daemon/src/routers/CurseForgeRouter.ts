import { RouterContext } from "@koa/router";
import { permission } from "../middlewares/permission";
import InstanceSubsystem from "../service/system_instance";
import { createCurseForgeTask } from "../service/async_task_service/CurseForgeInstallTask";
import { $t } from "../i18n";

export default function (router: any) {
  // 定義一個 POST 接口給前端調用
  // 權限設定為 level 10 (管理員)
  router.post("/api/curseforge/install", permission({ level: 10 }), async (ctx: RouterContext) => {
    const instanceUuid = ctx.query.uuid as string;
    const { projectId, versionId, apiKey } = ctx.request.body as any;

    const instance = InstanceSubsystem.getInstance(instanceUuid);
    if (!instance) {
      ctx.status = 404;
      ctx.body = "實例不存在";
      return;
    }

    // 基礎安全檢查
    if (instance.status() !== 0) {
      ctx.status = 400;
      ctx.body = "請先關閉伺服器再安裝整合包";
      return;
    }

    if (instance.asynchronousTask) {
      ctx.status = 400;
      ctx.body = "當前實例已有其他任務正在運行";
      return;
    }

    try {
      // 這裡會調用你剛寫好的 CurseForgeInstallTask.ts
      const task = createCurseForgeTask(instance, {
        projectId,
        versionId: versionId || "latest",
        apiKey
      });

      // 關聯到實例，這樣 MCSM 前端才會顯示「異步任務進行中」的狀態
      instance.asynchronousTask = task;

      ctx.body = { taskId: task.taskId };
    } catch (err: any) {
      ctx.status = 500;
      ctx.body = err.message;
    }
  });
}
