<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
// 使用最底層的 axios 實例，這在 MCSManager 前端幾乎所有組件都有引用
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
    
    // 直接使用 axios 發送請求，跳過那些找不到的導出函數
    // MCSManager 的 API 前綴通常是 /api
    await axios.post("/api/protected_instance/command", {
      commandName: "javaSwitch",
      commandParams: {
        startCommand: command
      }
    }, {
      params: {
        uuid: props.instanceId,
        remote_uuid: props.daemonId
      }
    });
    
    message.success(`${t("指令已發送：")} 正在切換至 ${label}`);
    open.value = false;
    emit("update");
  } catch (error: any) {
    // 處理 axios 的報錯
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
    <div style="display: flex; flex-direction: column; gap: 12px; padding: 10px 0;">
      <a-alert 
        :message="t('操作須知')" 
        description="切換版本前請務必先停止伺服器。" 
        type="warning" 
        show-icon 
      />
      
      <div class="java-button-group" style="display: flex; flex-direction: column; gap: 10px;">
        <a-button type="primary" ghost :loading="isLoading" block @click="submitJavaSwitch('./start_8_mc.sh', 'Java 8')">
          Java 8
        </a-button>
        <a-button type="primary" ghost :loading="isLoading" block @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')">
          Java 17
        </a-button>
        <a-button type="primary" ghost :loading="isLoading" block @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')">
          Java 21
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
