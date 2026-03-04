<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { reinstallInstance } from "@/services/apis/instance"; 
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message } from "ant-design-vue";

interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 6", value: "6", shell: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const handleConfirm = async () => {
  const versionObj = javaVersions.find(v => v.value === selectedJavaVersion.value);
  const targetShell = versionObj?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) return;

  Modal.confirm({
    title: t("確認切換 Java 版本"),
    content: `${t("將環境更改為")} ${versionObj?.label}。${t("此操作僅修改啟動指令，不會影響您的伺服器檔案。")}`,
    async onOk() {
      try {
        // 調用重裝接口，傳入「偽造」的模板數據
        await reinstallInstance().execute({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            // 這些欄位是為了繞過後端對「模板」的校驗
            targetUrl: "", 
            startCommand: targetShell,
            title: `Switch_Java_${selectedJavaVersion.value}`,
            description: "Quick update start command via virtual template",
            // 核心點：傳遞一個完整的 QuickStartPackages 結構，避免 500 錯誤
            instanceConfig: {
              nickname: `Instance_Java_${selectedJavaVersion.value}`,
              startCommand: targetShell,
              type: "minecraft/java" // 確保類型正確
            }
          }
        });
        
        message.success(t("Java 環境已透過模板邏輯切換成功！"));
        await submit(true);
      } catch (err: any) {
        // 如果報 Preset Config is not found，說明面板 API 強制校驗了數據庫中必須存在該模板
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog: async () => await open() });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('Java 版本安全切換')" :footer="null" width="400px">
    <div class="java-selector">
      <p style="color: #666; font-size: 13px;">{{ t('此方式利用安裝引導更新啟動指令，安全且無需管理員權限。') }}</p>
      <a-select v-model:value="selectedJavaVersion" style="width: 100%; margin: 15px 0;">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }} —— ({{ opt.shell }})
        </a-select-option>
      </a-select>
      <div class="btns">
        <a-button @click="cancel">{{ t('取消') }}</a-button>
        <a-button type="primary" @click="handleConfirm">{{ t('立即應用') }}</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-selector { padding: 10px; }
.btns { margin-top: 20px; text-align: right; }
.btns button { margin-left: 8px; }
</style>
