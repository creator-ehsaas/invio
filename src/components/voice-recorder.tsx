"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Language } from "@/types/invoice";

interface VoiceRecorderProps {
  language: Language;
  onTranscriptComplete: (transcript: string) => void;
  disabled?: boolean;
}

type RecordingStatus = "idle" | "recording" | "processing";

export function VoiceRecorder({
  language,
  onTranscriptComplete,
  disabled,
}: VoiceRecorderProps) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startWebSpeechRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setLiveTranscript(transcript);
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const startRecording = async () => {
    setError(null);
    setLiveTranscript("");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await processAudio();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setStatus("recording");

      startWebSpeechRecognition();
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access.");
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && status === "recording") {
      mediaRecorderRef.current.stop();
      setStatus("processing");
    }
  };

  const processAudio = async () => {
    const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("language", language);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      onTranscriptComplete(data.transcript);
      setStatus("idle");
    } catch (err) {
      setError("Transcription failed. Please try again.");
      setStatus("idle");
      console.error("Transcription error:", err);
    }
  };

  const handleClick = () => {
    if (status === "idle") {
      startRecording();
    } else if (status === "recording") {
      stopRecording();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4">
        <Button
          size="lg"
          variant={status === "recording" ? "destructive" : "default"}
          onClick={handleClick}
          disabled={disabled || status === "processing"}
          className="w-32 h-32 rounded-full text-2xl"
        >
          {status === "idle" && "🎤"}
          {status === "recording" && "⏹️"}
          {status === "processing" && "⏳"}
        </Button>

        <p className="text-sm text-muted-foreground">
          {status === "idle" && "Tap to start recording"}
          {status === "recording" && "Tap to stop recording"}
          {status === "processing" && "Processing audio..."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Live Transcript</label>
        <Textarea
          value={liveTranscript}
          readOnly
          placeholder="Start speaking to see live transcript..."
          className="min-h-[100px] resize-none"
        />
      </div>
    </div>
  );
}
