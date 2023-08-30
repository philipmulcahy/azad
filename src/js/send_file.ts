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

    const send_OrderInfo = new Promise<any>((resolve, reject) => {
      chrome.runtime.sendMessage(targetExtensionId, msg, (response: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });

    try {
      console.log(`Sending Msg:"${msg}" to Ext ID: ${targetExtensionId}`);

      send_OrderInfo
        .then((response) => {
          console.log(`Data Sent!`, response);
        })
        .catch((error) => {
          console.error("Error:", error);
        });
    } catch (error) {
      //console.warn(`Error sending message to ${targetExtensionId}:`, error);
    }
  }
}
