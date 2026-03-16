<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadAddress,
  moveFile as moveFileApi 
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { 
  CloudUploadOutlined, 
  InteractionOutlined,
  LoadingOutlined 
} from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

const open = ref(false);
const uploading = ref(false);
const props = defineProps<{ daemonId: string; instanceId: string; }>();

const { execute: fetchFiles } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();
const { execute: getUploadMissionCfg } = uploadAddress();
const { execute: executeMove } = moveFileApi();

const uploadData = uploadService.uiData;
const progress = computed(() => {
  if (uploadData.value.current) {
    return Math.floor((uploadData.value.current[0] * 100) / uploadData.value.current[1]);
  }
  return 0;
});

interface DetectedWorld {
  path: string;
  isNether: boolean;
  isEnd: boolean;
}

const openDialog = () => { open.value = true; };

const normalizePath = (path: string) => {
  return path.replace(/\/+$/, "") + "/";
};

/**
 * 終極暴力掃描器：無視 type 標記，直接用 API 行為驗證是否為目錄
 */
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = [], depth = 0) => {
  const currentPath = normalizePath(targetPath);
  
  // 限制最大深度，防止死循環
  if (depth > 10) return results; 

  try {
    // 1. 直接嘗試獲取該路徑下的文件列表
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    
    // 如果走到這裡沒報錯，說明 currentPath 確定是一個「目錄」
    const items = res.value?.items || [];
    console.log(`[Scan D-${depth}] 確認為目錄: ${currentPath} | 項目數: ${items.length}`);

    // 2. 檢查當前目錄下是否存在 level.dat
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat");

    if (hasLevelDat) {
      const lowerPath = currentPath.toLowerCase();
      // 識別維度 (地獄/末地)
      const isNether = lowerPath.includes("nether") || lowerPath.includes("dim-1");
      const isEnd = (lowerPath.includes("the_end") || lowerPath.includes("dim1") || lowerPath.includes("end")) && !lowerPath.includes("friend");
      
      console.log(`%c[√] 發現有效存檔: ${currentPath}`, "color: #52c41a; font-weight: bold;");
      results.push({ path: currentPath, isNether, isEnd });
    }

    // 3. 對所有項目嘗試「推門進入」遞歸
    for (const item of items) {
      const name = item.name.toLowerCase();
      // 跳過一些確定不需要進入的遊戲核心目錄以節省時間
      if (["logs", "plugins", "cache", "bin", "libraries", "versions", "config", "metadata"].includes(name)) continue;
      
      // 不判斷 type，直接遞歸嘗試進入子路徑
      await deepScanWorlds(`${currentPath}${item.name}/`, results, depth + 1);
    }
  } catch (e) {
    // 如果 fetchFiles 報錯，說明這個 targetPath 其實是個檔案，或者進不去。
    // 這是正常的，我們安靜地跳過。
  }
  return results;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器。") });
  }

  Modal.confirm({
    title: t("智慧替換確認"),
    content: t("系統將深度穿透解壓目錄，自動對齊主世界、地獄與末地結構。這將清空現有存檔。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // 1. 上傳壓縮包
        message.loading({ content: t("正在上傳存檔..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });
        const config = mission.value;
        if (!config?.addr) throw new Error("授權失敗");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => { if (!curr) { unwatch(); resolve(); } });
        });

        // 2. 解壓
        message.loading({ content: t("正在解壓並執行結構分析..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // 3. 掃描分析 (無視 type，行為驗證模式)
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        // 提取主世界 (取路徑最短的那個 level.dat 所在目錄)
        const mains = allDetected.filter(w => !w.isNether && !w.isEnd).sort((a, b) => a.path.length - b.path.length);
        const mainWorld = mains[0];

        if (!mainWorld) throw new Error(t("無法定位 level.dat，請檢查壓縮包內容。"));

        // 4. 重組搬運
        message.loading({ content: t("正在對齊結構..."), key: msgKey });
        
        // 清理舊目錄
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 先移主世界 (建立 /world/)
        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: [[mainWorld.path, "/world/"]] }
        });

        // 搬運維度資料夾 (精確對齊至 Vanilla 規範)
        const nether = allDetected.find(w => w.isNether);
        if (nether) {
          await executeMove({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets: [[nether.path, "/world/DIM-1/"]] }
          });
        }
        const end = allDetected.find(w => w.isEnd);
        if (end) {
          await executeMove({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets: [[end.path, "/world/DIM1/"]] }
          });
        }

        // 5. 清理臨時檔
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖智慧替換完成！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("操作失敗: ") + err.message, key: msgKey });
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('地圖智慧替換')" :footer="null" centered :mask-closable="!uploading" width="480px">
    <div class="p-4">
      <div v-if="!uploading">
        <a-upload-dragger :show-upload-list="false" :before-upload="(file: any) => { handleMapReplace(file); return false; }">
          <p class="ant-upload-drag-icon"><CloudUploadOutlined style="color: #1890ff" /></p>
          <p class="ant-upload-text">點擊或拖拽地圖壓縮包至此</p>
          <p class="ant-upload-hint">支持自動識別子目錄、無視錯誤的目錄標記並對齊維度結構</p>
        </a-upload-dragger>
      </div>
      <div v-else class="py-10 text-center">
        <LoadingOutlined spin style="font-size: 24px; color: #1890ff" />
        <div class="mt-4 text-base font-medium">
          {{ uploadData.current ? t('數據傳輸中...') : t('分析與對齊結構中...') }}
        </div>
        <div v-if="uploadData.current" class="mt-4 px-10">
          <a-progress :percent="progress" status="active" size="small" />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
