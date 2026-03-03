<script setup lang="ts">
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { CheckOutlined, FileTextOutlined, InfoCircleOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { ref, computed } from "vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);

// 定義 Java 配置映射
const JAVA_VERSIONS = [
  { label: "Java 6", value: "6", script: "/home/steam/start_6_mc.sh", jarFile: "startmc.jar" },
  { label: "Java 8", value: "8", script: "/home/steam/newstart_8_mc.sh", jarFile: "startmc.jar" },
  { label: "Java 17", value: "17", script: "/home/steam/newstart_17_mc.sh", jarFile: "startmc.jar" },
  { label: "Java 21", value: "21", script: "/home/steam/newstart_21_mc.sh", jarFile: "startmc.jar" },
  { label: "Forge/NeoForge", value: "21F", script: "/home/steam/start_21_newforge.sh", jarFile: "run.sh" },
  { label: "Java 25", value: "25", script: "/home/steam/start_25_mc.sh", jarFile: "startmc.jar" }
];

const open = ref(false);
const selectedJava = ref<string>("17");
// 注意：這裡使用針對普通用戶優化的更新接口（如果存在）
// 如果你的 service 只有 updateAnyInstanceConfig，請確保權限已開放
const { execute, isLoading } = updateInstanceConfig();

const currentSelection = computed(() => {
  return JAVA_VERSIONS.find((v) => v.value === selectedJava.value);
});

const initSelection = () => {
  const currentCmd = props.instanceInfo?.config?.startCommand || "";
  const found = JAVA_VERSIONS.find((v) => currentCmd.includes(v.script));
  selectedJava.value = found ? found.value : "17";
};

const openDialog = () => {
  // 根據後端代碼， status 0 是停止。運行中修改可能會觸發後端 Error
  if (props.instanceInfo && props.instanceInfo.status !== 0) {
    return message.warning(t("請先停止伺服器後再更換 Java 版本"));
  }
  initSelection();
  open.value = true;
};

const submit = async () => {
  try {
    if (!currentSelection.value || !props.instanceInfo?.config) return;

    // --- 重要：最小化發送數據，防止 403 Forbidden ---
    // 根據後端 Instance.ts 的 parameters 方法，我們只更新必要的字段
    const postData = {
      nickname: props.instanceInfo.config.nickname,
      startCommand: currentSelection.value.script,
      // 絕對不要發送 docker, processType, type 等字段，否則普通用戶會報權限不足
    };

    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: postData as any
    });

    message.success(`${t("已切換至")} ${currentSelection.value.label}`);
    emit("update");
    open.value = false;
  } catch (error: any) {
    console.error("Update failed:", error);
    return reportErrorMsg(error.message || t("修改失敗：可能是權限不足或實例正在運行"));
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :title="t('切換 Java 版本')"
    :confirm-loading="isLoading"
    @ok="submit"
  >

      <div class="version-selector">
        <div class="label">{{ t("選擇 Java 版本") }}</div>
        <a-radio-group v-model:value="selectedJava" button-style="solid" class="version-grid">
          <a-radio-button 
            v-for="item in JAVA_VERSIONS" 
            :key="item.value" 
            :value="item.value"
            class="v-btn"
          >
            <check-outlined v-if="selectedJava === item.value" />
            {{ item.label }}
          </a-radio-button>
        </a-radio-group>
      </div>

      <div v-if="currentSelection" class="detail-panel">
        <div class="detail-row">
          <span class="d-label">{{ t("依賴檔案") }}</span>
          <span class="d-value jar">
            <file-text-outlined /> {{ currentSelection.jarFile }}
          </span>
        </div>
        <div class="detail-row">
          <span class="d-label">{{ t("啟動腳本") }}</span>
          <code class="d-value cmd">{{ currentSelection.script }}</code>
        </div>
      </div>

      <div class="warning-text">
        {{ t("注意：切換後請確保伺服器目錄下已有對應的啟動檔案。") }}
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-config-body { padding: 4px 0; }
.alert-box {
  background-color: #e6f7ff;
  border: 1px solid #91d5ff;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #0050b3;
}
.version-selector { margin-bottom: 20px; }
.version-selector .label { margin-bottom: 12px; font-weight: bold; }
.version-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  width: 100%;
}
.v-btn {
  text-align: center;
  border-radius: 4px !important;
  border-left: 1px solid #d9d9d9 !important;
}
.detail-panel {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 16px;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.detail-row:last-child { margin-bottom: 0; }
.d-label { color: #8c8c8c; }
.d-value { font-weight: 500; }
.d-value.jar { color: #1890ff; }
.d-value.cmd { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
.warning-text { margin-top: 16px; color: #faad14; font-size: 12px; }
</style>
