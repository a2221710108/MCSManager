<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import axios from "axios";

const props = defineProps<{
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);
const open = ref(false);
const isLoading = ref(false);

const openDialog = () => {
  open.value = true;
};

const submitJavaSwitch = async (command: string, label: string) => {
  if (!props.instanceId || !props.daemonId) {
    return message.error("無法獲取實例資訊");
  }

  try {
    isLoading.value = true;
    
    /**
     * 注意：MCSManager 的 API 校驗器要求 
     * 1. URL 參數 (params) 必須包含 uuid 和 remote_uuid
     * 2. Body 數據 (data) 必須包含 command 欄位
     */
    await axios.post("/api/protected_instance/command", 
      {
        // 這是後端 dispatcher.ts 中 setPreset 的標籤
        command: "javaSwitch", 
        // 這是傳給 JavaSwitchCommand 中 exec(instance, params) 的 params
        params: {
          startCommand: command
        }
      }, 
      {
        params: {
          uuid: props.instanceId,
          remote_uuid: props.daemonId
        }
      }
    );
    
    message.success(`${t("指令已發送：")} ${label}`);
    open.value = false;
    emit("update");
  } catch (error: any) {
    // 優先顯示後端回傳的錯誤（例如：請先停止伺服器）
    const errorMsg = error.response?.data?.data || error.message;
    reportErrorMsg(errorMsg);
  } finally {
    isLoading.value = false;
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal 
    v-model:open="open" 
    :title="t('一鍵切換 Java 版本')" 
    :footer="null"
    :mask-closable="!isLoading"
    :closable="!isLoading"
  >
    <div class="java-switch-container">
      <a-alert 
        :message="t('操作須知')" 
        description="切換版本前請務必停止伺服器。此操作將修改啟動指令並保存。" 
        type="warning" 
        show-icon 
        style="margin-bottom: 16px;"
      />
      
      <div class="button-list">
        <a-button 
          type="primary" 
          block 
          ghost
          size="large"
          :loading="isLoading" 
          @click="submitJavaSwitch('./start_8_mc.sh', 'Java 8')"
        >
          切換至 Java 8 環境
        </a-button>
        
        <a-button 
          type="primary" 
          block 
          ghost
          size="large"
          :loading="isLoading" 
          @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')"
        >
          切換至 Java 17 環境
        </a-button>
        
        <a-button 
          type="primary" 
          block 
          ghost
          size="large"
          :loading="isLoading" 
          @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')"
        >
          切換至 Java 21 環境
        </a-button>
      </div>

      <div class="footer-tip">
        {{ t('提示：切換後請檢查控制台日誌確認結果。') }}
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-switch-container {
  padding: 8px 0;
}
.button-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.footer-tip {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #8c8c8c;
}
</style>
