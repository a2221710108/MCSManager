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

// --- 強力全深度掃描器 (修正版) ---
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = [], depth = 0) => {
  const currentPath = normalizePath(targetPath);
  if (depth > 10) return results; 

  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    
    const items = res.value?.items || [];
    // 同步日誌，方便你觀察到底進沒進去
    console.log(`[Scan D-${depth}] ${currentPath} ->`, items.map(i => i.name + `(type:${i.type})`));

    // 1. 檢查當前目錄是否有 level.dat
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat");

    if (hasLevelDat) {
      const lowerPath = currentPath.toLowerCase();
      const isNether = lowerPath.includes("nether") || lowerPath.includes("dim-1");
      const isEnd = (lowerPath.includes("the_end") || lowerPath.includes("dim1") || lowerPath.includes("end")) && !lowerPath.includes("friend");
      
      console.log(`%c[√] 發現存檔: ${currentPath}`, "color: #52c41a; font-weight: bold;");
      results.push({ path: currentPath, isNether, isEnd });
    }

    // 2. 遞歸邏輯優化
    for (const item of items) {
      // 修正點：即使 type 不是 1，只要名稱沒有後綴（可能是無後綴資料夾）
      // 或者明確 type === 1，我們都嘗試鑽進去
      const isProbablyFolder = item.type === 1 || (!item.name.includes(".") && item.size === 0) || item.name === "11122"; 
      
      if (isProbablyFolder) {
        const folderName = item.name.toLowerCase();
        // 過濾系統目錄
        if (["logs", "plugins", "cache", "bin", "libraries", "versions", "config", "metadata"].includes(folderName)) continue;
        
        const nextPath = `${currentPath}${item.name}/`;
        await deepScanWorlds(nextPath, results, depth + 1);
      }
    }
  } catch (e) {
    console.warn(`[Skip] ${currentPath}`);
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
    title: t("確認執行智慧替換？"),
    content: t("將自動識別存檔層級並對齊至標準結構。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // 1. 上傳
        message.loading({ content: t("正在上傳..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });
        const config = mission.value;
        if (!config?.addr) throw new Error("傳輸授權失敗");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
            if (!curr) { unwatch(); resolve(); }
          });
        });

        // 2. 解壓
        message.loading({ content: t("正在解壓並分析..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // 這裡給予一個短暫延遲，防止某些檔案系統解壓後索引未更新
        await new Promise(r => setTimeout(r, 1000));

        // 3. 掃描
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        const mains = allDetected.filter(w => !w.isNether && !w.isEnd).sort((a, b) => a.path.length - b.path.length);
        const mainWorld = mains[0];

        if (!mainWorld) throw new Error(t("掃描完成但找不到 level.dat。請檢查壓縮包格式。"));

        // 4. 重組
        message.loading({ content: t("正在重組資料夾結構..."), key: msgKey });
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 搬運主世界
        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: [[mainWorld.path, "/world/"]] }
        });

        // 搬運維度
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

        // 5. 清理
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖智慧替換成功！"), key: msgKey });
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
          <p class="ant-upload-hint">支持深度嵌套識別與標準化對齊</p>
        </a-upload-dragger>
      </div>
      <div v-else class="py-10 text-center">
        <LoadingOutlined spin style="font-size: 24px" />
        <div class="mt-4 text-lg">{{ uploadData.current ? t('正在傳輸...') : t('正在分析結構...') }}</div>
        <a-progress v-if="uploadData.current" :percent="progress" class="mt-4" />
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
