// 文件位置參考: /src/routers/RemoteServiceRouter.ts (或類似位置)
import Router from "@koa/router";
import axios from "axios";

const router = new Router({ prefix: "/remote" });

/**
 * 遠端版本獲取接口 (Proxy)
 * 用於解決前端直接請求第三方 API 導致的 CORS 問題
 */
router.get("/modloader/versions", async (ctx) => {
    const { type, mcVersion } = ctx.query;

    if (!type || !mcVersion) {
        ctx.status = 400;
        ctx.body = "Missing parameters";
        return;
    }

    try {
        let targetUrl = "";
        
        // 根據類型映射到對應的鏡像源
        switch (type) {
            case "forge":
                targetUrl = `https://bmclapi2.bangbang93.com/forge/minecraft/${mcVersion}`;
                break;
            case "neoforge":
                targetUrl = `https://bmclapi2.bangbang93.com/neoforge/list/${mcVersion}`;
                break;
            case "fabric":
                targetUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
                break;
            case "quilt":
                targetUrl = `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`;
                break;
            default:
                throw new Error("Invalid loader type");
        }

        // 使用服務器端發起請求，繞過 CORS
        const response = await axios.get(targetUrl, { 
            timeout: 8000,
            headers: { 'User-Agent': 'MCSManager-Custom-Modloader' }
        });

        // 原封不動將數據傳回前端，或在後端進行初步過濾
        ctx.body = response.data;
        
    } catch (error: any) {
        console.error(`[Modloader Proxy] Error: ${error.message}`);
        ctx.status = 500;
        ctx.body = { error: "遠端 API 請求失敗，請稍後再試" };
    }
});

export default router;
