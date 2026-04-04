"use client";

import { useState, useRef } from "react";

interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void;
  onError?: (err: string) => void;
}

export function useVoiceInput({ onTranscript, onError }: UseVoiceInputOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribe(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      onError?.("Could not access microphone. Please grant permission.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const transcribe = async (blob: Blob): Promise<string> => {
    setIsTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Transcription failed");
      const { transcript } = await res.json();
      onTranscript?.(transcript || "");
      return transcript || "";
    } catch {
      onError?.("Could not transcribe audio. Please try again.");
      return "";
    } finally {
      setIsTranscribing(false);
    }
  };

  const busy = isRecording || isTranscribing;

  return { isRecording, isTranscribing, busy, startRecording, stopRecording, toggleRecording };
}
