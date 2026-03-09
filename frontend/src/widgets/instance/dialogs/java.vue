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
  { label: "21(Forge/NeoForge)", value: "21F", script: "/home/steam/start_21_newforge.sh", jarFile: "run.sh" },
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
    :width="520" 
    @ok="submit"
  >
    <div class="java-config-container">
      <a-typography-paragraph type="secondary" class="desc-text">
        {{ t("請選擇合適的 Java 版本，系統將根據選擇調整啟動參數。") }}
      </a-typography-paragraph>

      <a-radio-group v-model:value="selectedJava" button-style="solid" class="version-grid">
        <a-radio-button 
          v-for="item in JAVA_VERSIONS" 
          :key="item.value" 
          :value="item.value"
          class="version-card-item"
        >
          <div class="btn-content">
            <check-outlined v-if="selectedJava === item.value" class="check-icon" />
            <span class="label-text">{{ item.label }}</span>
          </div>
        </a-radio-button>
      </a-radio-group>

      <transition name="fade">
        <div v-if="currentSelection" class="info-card">
          <div class="info-row">
            <span class="info-label">{{ t("依賴啟動檔案") }}</span>
            <span class="info-value highlight">
              <file-text-outlined />
              <span class="file-name">{{ currentSelection.jarFile }}</span>
            </span>
          </div>
          
          <a-divider class="card-divider" />
          
          <div class="notice-box">
            <exclamation-circle-outlined />
            <span>{{ t("提示：切換後請確保伺服器根目錄下已放置上述檔案。") }}</span>
          </div>
        </div>
      </transition>
    </div>
  </a-modal>
</template>

<style scoped>
.java-config-container {
  padding: 8px;
}

.desc-text {
  margin-bottom: 20px;
  font-size: 14px;
}

/* 核心 Grid 佈局 */
.version-grid {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
}

/* --- 核心修復：按鈕基礎與選中設計 --- */
.version-card-item {
  height: auto !important;
  padding: 0 8px !important;
  line-height: 40px !important;
  text-align: center;
  border-radius: 6px !important;
  
  /* 基礎狀態：白色背景，灰色邊框 */
  border: 1px solid var(--ant-color-border) !important;
  margin-inline-start: 0 !important;
  background: var(--ant-color-bg-container);
  color: var(--ant-color-text);
  
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* 移除按鈕間的預設分割線 */
.version-card-item:before {
  display: none !important; 
}

/* --- 💡 重要：選中後的藍色背景設計 (參考 AntD 標準) --- */
.version-card-item.ant-radio-button-wrapper-checked {
  /* 背景變為淺藍色 (Primary Background) */
  background: var(--ant-color-primary-bg) !important;
  /* 邊框變為品牌藍 (Primary) */
  border-color: var(--ant-color-primary) !important;
  /* 文字變為品牌藍 */
  color: var(--ant-color-primary) !important;
  
  /* 稍微加深陰影，增加立體感 */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  z-index: 2;
}

/* 懸停狀態：邊框變色但保持背景 */
.version-card-item:hover:not(.ant-radio-button-wrapper-checked) {
  border-color: var(--ant-color-primary-hover) !important;
  color: var(--ant-color-primary-hover) !important;
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
}

.label-text {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- 藍色信息卡片樣式 --- */
.info-card {
  background: var(--ant-color-primary-bg); 
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--ant-color-primary-border);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.info-label {
  color: var(--ant-color-text-description);
  font-size: 13px;
}

.highlight {
  color: var(--ant-color-primary);
  font-weight: 600;
}

/* --- 📱 移動端適配 (響應式) --- */
@media (max-width: 576px) {
  .version-grid {
    grid-template-columns: repeat(2, 1fr); /* 手機版 2 欄 */
    gap: 10px;
  }
}

@media (max-width: 380px) {
  .version-grid {
    grid-template-columns: 1fr; /* 極窄手機 1 欄 */
  }
}
</style>
