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
import { CloudUploadOutlined, LoadingOutlined, DeleteOutlined } from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

// 強制定義類型，避免 undefined 賦值錯誤
interface WorldScanResult {
  path: string;
  isNether: boolean;
  isEnd: boolean;
}

const open = ref(false);
const uploading = ref(false);
const agreeTest = ref(false);
const agreeBackup = ref(false);
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

const openDialog = () => { open.value = true; };
const normalizePath = (path: string) => path.replace(/\/+$/, "") + "/";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const handleDeleteCurrentWorld = async () => {
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.error({
      title: t("無法刪除存檔"),
      content: t("伺服器正在運行或維護中，請先關閉伺服器後再清理檔案。"),
      okText: t("知道了")
    });
  }

  Modal.confirm({
    title: t("確認刪除現有存檔？"),
    content: t("這將永久刪除您現有的存檔，除非你建立了備份。刪除後預設情況下，下次啟動伺服器將重新生成地圖。"),
    okText: t("確定刪除"),
    okType: "danger",
    onOk: async () => {
      try {
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });
        message.success(t("現有存檔已刪除"));
      } catch (err: any) {
        message.error(t("刪除失敗: ") + err.message);
      }
    }
  });
};

const handleCancelUpload = () => {
  uploading.value = false;
  message.warn(t("操作已取消"));
};

const deepScanWorlds = async (targetPath: string, results: WorldScanResult[] = [], depth = 0): Promise<WorldScanResult[]> => {
  const currentPath = normalizePath(targetPath);
  if (depth > 5) return results;

  await sleep(2500);

  try {
    const res = await fetchFiles({
      params: { daemonId: props.daemonId, uuid: props.instanceId, target: currentPath, page: 0, page_size: 100, file_name: "" }
    });
    
    const items = res.value?.items || [];
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat" && i.type === 1);
    
    if (hasLevelDat) {
      const lowerPath = currentPath.toLowerCase();
      
      // 使用 !! 強制轉為布林值，確保不為 undefined
      const isNether: boolean = !!(lowerPath.endsWith("/dim-1/") || lowerPath.endsWith("/world_nether/") || lowerPath.endsWith("/nether/"));
      const isEndRaw: boolean = !!(lowerPath.endsWith("/dim1/") || lowerPath.endsWith("/world_the_end/") || lowerPath.endsWith("/the_end/") ||
                    (lowerPath.includes("end") && !lowerPath.includes("friend") && lowerPath.split('/').filter(Boolean).pop()?.includes("end")));

      results.push({ 
        path: currentPath, 
        isNether: isNether, 
        isEnd: isEndRaw && !isNether 
      });
    }

    const subDirs = items.filter(i => i.type === 0 && !["logs", "plugins", "cache", "bin", "libraries", "versions", "config"].includes(i.name.toLowerCase()));
    for (const dir of subDirs) {
      await deepScanWorlds(`${currentPath}${dir.name}/`, results, depth + 1);
    }
  } catch (e: any) {
    if (e.message?.includes("冷卻期")) {
      await sleep(2500);
      return await deepScanWorlds(targetPath, results, depth);
    }
  }
  return results;
};

const resolveFinalPath = async (detectedPath: string, dimFolderName: string) => {
  try {
    const res = await fetchFiles({
      params: { daemonId: props.daemonId, uuid: props.instanceId, target: detectedPath, page: 0, page_size: 50, file_name: "" }
    });
    const subDim = res.value?.items.find(i => i.name.toUpperCase() === dimFolderName && i.type === 0);
    return subDim ? normalizePath(`${detectedPath}${subDim.name}`) : detectedPath;
  } catch {
    return detectedPath;
  }
};

const handleMapReplace = async (file: File) => {
  if (!agreeTest.value || !agreeBackup.value) return message.error(t("請先勾選所有同意項目"));

  const msgKey = "map_replace_task";
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) return Modal.error({ title: t("無法開始替換"), content: t("您的伺服器正在運行中或維護中，請先關閉伺服器後再使用該功能。") });

  uploading.value = true;
  const tempDirName = `tmp_map_${Date.now()}`;

  try {
    message.loading({ content: t("開始上載..."), key: msgKey });
    const mission = await getUploadMissionCfg({ params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name } });
    const config = mission.value;
    if (!config?.addr) throw new Error("授權失敗");

    await new Promise<void>((resolve, reject) => {
      uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
        task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
      });
      const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
        if (!uploading.value) { 
          unwatch(); 
          uploadService.stop(); 
          reject(new Error("CANCEL")); 
          return;
        }
        if (!curr) { unwatch(); resolve(); }
      });
    });

    message.loading({ content: t("正在分析存檔結構..."), key: msgKey });
    await executeCompress({ 
      params: { uuid: props.instanceId, daemonId: props.daemonId }, 
      data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` } 
    });

    const allDetected: WorldScanResult[] = await deepScanWorlds(`/${tempDirName}/`);
    const nether = allDetected.find((w: WorldScanResult) => w.isNether);
    const end = allDetected.find((w: WorldScanResult) => w.isEnd);
    const mainWorld = allDetected.filter((w: WorldScanResult) => !w.isNether && !w.isEnd).sort((a: WorldScanResult, b: WorldScanResult) => a.path.length - b.path.length)[0];

    if (!mainWorld) throw new Error(t("無法定位主世界存檔"));

    const moveTasks: [string, string][] = [[mainWorld.path, "/world/"]];
    if (nether) moveTasks.push([await resolveFinalPath(nether.path, "DIM-1"), "/world/DIM-1/"]);
    if (end) moveTasks.push([await resolveFinalPath(end.path, "DIM1"), "/world/DIM1/"]);

    await executeDelete({ 
      params: { daemonId: props.daemonId, uuid: props.instanceId }, 
      data: { targets: ["/world", "/world_nether", "/world_the_end"] } 
    });

    await executeMove({ 
      params: { daemonId: props.daemonId, uuid: props.instanceId }, 
      data: { targets: moveTasks } 
    });

    await executeDelete({ 
      params: { daemonId: props.daemonId, uuid: props.instanceId }, 
      data: { targets: ["/" + file.name, "/" + tempDirName] } 
    });

    message.success({ content: t("存檔替換完成！"), key: msgKey });
    open.value = false;
  } catch (err: any) {
    if (err.message !== "CANCEL") message.error({ content: t("失敗: ") + err.message, key: msgKey });
    executeDelete({ params: { daemonId: props.daemonId, uuid: props.instanceId }, data: { targets: ["/" + tempDirName] } });
  } finally {
    uploading.value = false;
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('存檔替換')" :footer="null" centered :mask-closable="false" width="520px">
    <div class="p-4">
      <div v-if="!uploading">
        <div class="mb-4 flex justify-between items-center">
          <span class="text-gray-400 text-xs">{{ t('請同意以下項目') }}</span>
          <a-button danger size="small" type="text" @click="handleDeleteCurrentWorld">
            <template #icon><DeleteOutlined /></template>
            {{ t('僅刪除現有存檔') }}
          </a-button>
        </div>

        <div class="mb-4 p-3 bg-orange-50 rounded border border-orange-100">
          <div class="flex flex-col gap-2">
            <a-checkbox v-model:checked="agreeTest">
              <span class="text-xs text-orange-700">{{ t('我已知曉使用該功能將刪除現有的存檔') }}</span>
            </a-checkbox>
            <a-checkbox v-model:checked="agreeBackup">
              <span class="text-xs text-orange-700">{{ t('我已備份現有存檔，或我確認無需備份現有存檔') }}</span>
            </a-checkbox>
          </div>
        </div>

        <a-upload-dragger 
          :disabled="!agreeTest || !agreeBackup"
          :show-upload-list="false" 
          :before-upload="(file: any) => { handleMapReplace(file); return false; }"
        >
          <p class="ant-upload-drag-icon">
            <CloudUploadOutlined :style="{ color: (agreeTest && agreeBackup) ? '#1890ff' : '#d9d9d9' }" />
          </p>
          <p class="ant-upload-text">點擊或拖拽地圖壓縮包至此</p>
          <p class="ant-upload-hint">需勾選上方同意事項以解鎖上載</p>
        </a-upload-dragger>
      </div>

      <div v-else class="upload-status-container py-8">
        <div class="flex items-center justify-center mb-6">
          <LoadingOutlined spin class="mr-2 text-primary" style="font-size: 1.1em;" />
          <span class="text-base font-medium">
            {{ uploadData.current ? t('正在上載您的存檔...') : t('正在分析與處理存檔結構...') }}
          </span>
        </div>
        
        <div v-if="uploadData.current" class="px-8 flex flex-col items-center">
          <div class="w-full">
             <a-progress :percent="progress" status="active" />
          </div>
          <div class="mt-6">
            <a-button @click="handleCancelUpload">{{ t('取消上載') }}</a-button>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
:deep(.ant-checkbox-wrapper) {
  align-items: flex-start;
}
:deep(.ant-progress-outer) {
  padding-right: 0 !important;
  margin-right: 0 !important;
}
.text-primary {
  color: #1890ff;
}
.upload-status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
