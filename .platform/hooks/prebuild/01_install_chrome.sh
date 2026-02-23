#!/bin/bash
if ! command -v google-chrome &> /dev/null; then
    curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm -o /tmp/chrome.rpm
    yum install -y /tmp/chrome.rpm || dnf install -y /tmp/chrome.rpm
    rm -f /tmp/chrome.rpm
fi