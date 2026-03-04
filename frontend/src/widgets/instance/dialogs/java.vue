<script setup lang="ts">
import { t } from "@/lang/i18n";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types";
import { CheckOutlined, FileTextOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import _ from "lodash";
import { ref, computed } from "vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);

/**
 * 定義 Java 配置映射
 * script: 最終寫入數據庫的啟動指令
 * jarFile: 提示用戶需要準備的啟動檔案名稱
 */
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
const { execute, isLoading } = updateAnyInstanceConfig();

// 計算目前選中的版本完整信息
const currentSelection = computed(() => {
  return JAVA_VERSIONS.find((v) => v.value === selectedJava.value);
});

const initSelection = () => {
  const currentCmd = props.instanceInfo?.config?.startCommand || "";
  const found = JAVA_VERSIONS.find((v) => currentCmd.includes(v.script));
  selectedJava.value = found ? found.value : "17";
};

const openDialog = () => {
  // 檢查伺服器狀態：假設 status 為 0 代表已停止
  if (props.instanceInfo && props.instanceInfo.status !== 0) {
    return message.error(t("必須先關閉伺服器才能切換 Java 版本！"));
  }
  initSelection();
  open.value = true;
};

const submit = async () => {
  try {
    if (!currentSelection.value || !props.instanceInfo?.config) return;

    // 克隆完整配置並修改 startCommand
    const postData = _.cloneDeep(props.instanceInfo.config);
    postData.startCommand = currentSelection.value.script;

    await execute({
      params: {
        uuid: props.instanceId ?? "",
        daemonId: props.daemonId ?? ""
      },
      data: postData
    });

    message.success(`${t("已切換至")} ${currentSelection.value.label}`);
    emit("update");
    open.value = false;
  } catch (error: any) {
    return reportErrorMsg(error.message || t("切換失敗"));
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
    <div class="java-config-body">
      <a-typography-paragraph type="secondary">
        {{ t("請選擇合適的 Java 版本。") }}
      </a-typography-paragraph>

      <a-radio-group v-model:value="selectedJava" button-style="solid" class="version-grid">
        <a-radio-button 
          v-for="item in JAVA_VERSIONS" 
          :key="item.value" 
          :value="item.value"
          class="version-card"
        >
          <div class="btn-content">
            <check-outlined v-if="selectedJava === item.value" />
            {{ item.label }}
          </div>
        </a-radio-button>
      </a-radio-group>

      <div v-if="currentSelection" class="info-card">
        <div class="info-item">
          <span class="info-label">{{ t("依賴啟動檔案：") }}</span>
          <span class="info-value highlight">
            <file-text-outlined /> {{ currentSelection.jarFile }}
          </span>
        </div>

        
        <a-divider style="margin: 12px 0" />
        
        <div class="notice">
          <small>⚠️ {{ t("提示：切換後請確保伺服器根目錄下已放置上述啟動檔案。") }}</small>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.version-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  margin-bottom: 20px;
}

.version-card {
  height: 40px;
  line-height: 38px;
  text-align: center;
  border-radius: 4px !important;
  border-left: 1px solid #d9d9d9 !important;
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.info-card {
  background: #f8f9fb;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e1e4e8;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.info-label {
  color: #666;
  font-size: 13px;
}

.info-value {
  font-weight: 600;
  color: #2c3e50;
}

.info-value.highlight {
  color: #1890ff;
}

.info-value.code {
  background: #eee;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.notice {
  color: #faad14;
}
</style>
