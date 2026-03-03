<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
// 更改導入：使用基礎的請求工具
import { request } from "@/services/api";

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
    // 使用基礎 request 調用 MCSManager 的指令執行接口
    await request({
      method: "POST",
      url: "/api/protected_instance/command",
      params: { 
        uuid: props.instanceId, 
        remote_uuid: props.daemonId 
      },
      data: {
        // 這裡對應後端 dispatcher.ts 中的 setPreset 名稱
        commandName: "javaSwitch", 
        commandParams: {
          startCommand: command
        }
      }
    });
    
    message.success(`${t("指令已發送：")} 正在切換至 ${label}`);
    open.value = false;
    emit("update");
  } catch (error: any) {
    reportErrorMsg(error);
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
        description="切換版本前請務必先停止伺服器。此操作將直接修改啟動指令。" 
        type="warning" 
        show-icon 
      />
      
      <div class="java-button-group">
        <a-button 
          type="primary" 
          ghost 
          :loading="isLoading" 
          block 
          @click="submitJavaSwitch('./start_8_mc.sh', 'Java 8')"
        >
          切換至 Java 8
        </a-button>
        
        <a-button 
          type="primary" 
          ghost 
          :loading="isLoading" 
          block 
          @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')"
        >
          切換至 Java 17
        </a-button>
        
        <a-button 
          type="primary" 
          ghost 
          :loading="isLoading" 
          block 
          @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')"
        >
          切換至 Java 21
        </a-button>
      </div>

      <p style="font-size: 12px; color: #888; text-align: center; margin-top: 8px;">
        注意：請確保伺服器目錄下已有對應的 .sh 腳本。
      </p>
    </div>
  </a-modal>
</template>

<style scoped>
.java-button-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}
</style>
