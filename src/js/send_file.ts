/* jshint strict: true, esversion: 6 */

"use strict";

export async function send(
  file_content_string: string,
  targetExtensionId: string
): Promise<void> {
  // chrome.runtime.sendMessage is available, proceed with sending the message
  if (chrome.runtime && targetExtensionId) {
    const msg = {
      message: "success",
      data: file_content_string,
    };

    try {
      console.log(`Sending Msg:"${msg}" to Ext ID: ${targetExtensionId}`);
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage(targetExtensionId, msg, (response: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      console.log(`Data Sent!`, response);
    } catch(error) {
      console.error("Error:", error);
    }
  }
}
