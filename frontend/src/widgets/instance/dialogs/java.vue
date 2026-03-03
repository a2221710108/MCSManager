<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message } from "ant-design-vue";
import { executeInstanceCommand } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";

// 接收來自父組件的實例 ID 與 守護進程 ID
const props = defineProps<{
  instanceId?: string;
  daemonId?: string;
}>();

const emit = defineEmits(["update"]);
const open = ref(false);

// 使用 MCSManager 內置的 API Hook
const { execute, isLoading } = executeInstanceCommand();

// 暴露給父組件（如 instance 詳情頁）調用的開啟方法
const openDialog = () => {
  open.value = true;
};

/**
 * 送出切換指令
 * @param command 預設的啟動腳本路徑
 * @param label 顯示給用戶看的版本名稱
 */
const submitJavaSwitch = async (command: string, label: string) => {
  if (!props.instanceId || !props.daemonId) {
    return message.error("無法獲取實例資訊，請重新整理頁面");
  }

  try {
    await execute({
      params: { 
        uuid: props.instanceId, 
        daemonId: props.daemonId 
      },
      data: {
        // 這裡必須與後端 dispatcher.ts 中 setPreset 的第一個參數完全一致
        name: "javaSwitch", 
        params: {
          startCommand: command
        }
      }
    });
    
    message.success(`${t("指令已發送：")} 正在切換至 ${label}`);
    open.value = false;
    
    // 通知父組件更新界面（例如刷新實例日誌或狀態）
    emit("update");
  } catch (error: any) {
    // 報錯處理（例如伺服器未關閉時後端拋出的 Error）
    reportErrorMsg(error);
  }
};

// 必須暴露此方法，否則父組件無法透過 ref 調用 openDialog
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
        description="切換 Java 版本前，請務必先停止伺服器。此操作會修改實例的啟動指令。" 
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
          切換至 Java 8 (適用 1.12.2 及以下)
        </a-button>
        
        <a-button 
          type="primary" 
          ghost 
          :loading="isLoading" 
          block 
          @click="submitJavaSwitch('./start_17_mc.sh', 'Java 17')"
        >
          切換至 Java 17 (適用 1.18.2+)
        </a-button>
        
        <a-button 
          type="primary" 
          ghost 
          :loading="isLoading" 
          block 
          @click="submitJavaSwitch('./start_21_mc.sh', 'Java 21')"
        >
          切換至 Java 21 (適用 1.20.5+)
        </a-button>
      </div>

      <p style="font-size: 12px; color: #888; text-align: center; margin-top: 8px;">
        提示：若切換後無法啟動，請檢查根目錄是否存在對應腳本。
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
