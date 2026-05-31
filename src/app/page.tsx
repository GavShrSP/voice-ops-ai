"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

type Task = {
  id?: number;
  employee: string;
  task: string;
  deadline: string;
  status: string;
};

type StatCard = {
  title: string;
  value: number;
  helper: string;
  icon: string;
  iconClassName: string;
  gradientClassName: string;
};

type SpeechRecognitionEventResult = {
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEvent = {
  results: {
    length: number;
    [index: number]: SpeechRecognitionEventResult;
  };
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

async function getSavedTasks() {
  return supabase
    .from("Tasks")
    .select("id, employee, task, deadline, status")
    .order("id", { ascending: false });
}

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceTranscript, setIsVoiceTranscript] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const updateTasksFromSupabase = (
    data: Task[] | null,
    error: { message: string } | null
  ) => {
    if (error) {
      console.log("Supabase Fetch Error:", error);
      setErrorMessage("Could not load saved tasks from Supabase.");
    } else {
      setTasks(data || []);
    }
  };

  const refreshSavedTasks = async () => {
    const { data, error } = await getSavedTasks();
    updateTasksFromSupabase(data, error);
  };

  useEffect(() => {
    let shouldUpdatePage = true;

    const loadSavedTasks = async () => {
      const { data, error } = await getSavedTasks();

      if (!shouldUpdatePage) {
        return;
      }

      updateTasksFromSupabase(data, error);
      setIsLoadingTasks(false);
    };

    loadSavedTasks();

    return () => {
      shouldUpdatePage = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const dashboardStats = useMemo(() => {
    const completedTasks = tasks.filter(
      (task) => task.status.toLowerCase() === "completed"
    ).length;
    const pendingTasks = tasks.filter(
      (task) => task.status.toLowerCase() === "pending"
    ).length;

    return {
      total: tasks.length,
      pending: pendingTasks,
      completed: completedTasks,
      completionRate:
        tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100),
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const searchValue = taskSearch.trim().toLowerCase();

    if (!searchValue) {
      return tasks;
    }

    return tasks.filter((task) => {
      const searchableText = [
        task.employee,
        task.task,
        task.deadline,
        task.status,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchValue);
    });
  }, [taskSearch, tasks]);

  const extractTasks = async () => {
    setIsExtracting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/extract-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript,
        }),
      });

      const data = await response.json();

      console.log("TASK DATA:", data.result);

      if (!data.result) {
        setErrorMessage("No tasks were returned from the transcript.");
        return;
      }

      setTasks(data.result);
      setIsVoiceTranscript(false);

      const tasksToSave = data.result.map((task: Task) => ({
        employee: task.employee,
        task: task.task,
        deadline: task.deadline,
        status: task.status,
      }));

      const { data: insertedData, error } = await supabase
        .from("Tasks")
        .insert(tasksToSave);

      console.log("Inserted:", insertedData);
      console.log("Supabase Error:", error);

      if (error) {
        setErrorMessage("Tasks were extracted, but could not be saved.");
        return;
      }

      setSuccessMessage("Tasks saved to Supabase successfully.");
      await refreshSavedTasks();
    } catch (error) {
      console.log("Extract Tasks Error:", error);
      setErrorMessage("Something went wrong while extracting tasks.");
    } finally {
      setIsExtracting(false);
    }
  };

  const startRecording = () => {
    const browserWindow = window as WindowWithSpeechRecognition;
    const SpeechRecognition =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage("Speech recognition is only supported in Google Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let spokenText = "";

      for (let index = 0; index < event.results.length; index += 1) {
        spokenText += event.results[index][0].transcript;
      }

      setTranscript(spokenText.trim());
      setIsVoiceTranscript(true);
    };

    recognition.onerror = (event) => {
      setIsRecording(false);
      setErrorMessage(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setErrorMessage("");
    setIsRecording(true);
    recognition.start();
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const getStatusBadgeClass = (status: string) => {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === "completed") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (normalizedStatus === "pending") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    if (normalizedStatus === "in progress") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  const getInitials = (name: string) => {
    if (!name.trim()) {
      return "AI";
    }

    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const statsCards: StatCard[] = [
    {
      title: "Total Tasks",
      value: dashboardStats.total,
      helper: "All saved work items",
      icon: "T",
      iconClassName: "bg-blue-600 text-white",
      gradientClassName: "from-blue-50 to-white",
    },
    {
      title: "Pending Tasks",
      value: dashboardStats.pending,
      helper: "Waiting on action",
      icon: "P",
      iconClassName: "bg-amber-500 text-white",
      gradientClassName: "from-amber-50 to-white",
    },
    {
      title: "Completed Tasks",
      value: dashboardStats.completed,
      helper: "Marked as done",
      icon: "C",
      iconClassName: "bg-emerald-500 text-white",
      gradientClassName: "from-emerald-50 to-white",
    },
    {
      title: "Completion Rate",
      value: dashboardStats.completionRate,
      helper: "Execution progress",
      icon: "%",
      iconClassName: "bg-indigo-500 text-white",
      gradientClassName: "from-indigo-50 to-white",
    },
  ];

  return (
    <main className="h-screen overflow-hidden bg-slate-100 p-3 text-slate-950 sm:p-4">
      <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-3">
        <header className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl shadow-slate-200/70">
          <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-700 px-5 py-3 text-white sm:px-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
                  AI operations platform
                </div>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                  <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                    VoiceOps AI
                  </h1>
                  <p className="pb-1 text-sm font-semibold text-blue-100 sm:text-base">
                    Turn Conversations Into Execution
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:items-center">
                <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
                  <p className="text-blue-100">Extraction</p>
                  <p className="font-bold">OpenRouter LLM</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
                  <p className="text-blue-100">Storage</p>
                  <p className="font-bold">Supabase sync</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(340px,38%)_minmax(0,62%)]">
          <div className="sticky top-24 flex min-h-0 flex-col rounded-3xl border border-white bg-white p-4 shadow-xl shadow-slate-200/70">
            <div className="mb-2 flex shrink-0 flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Voice command center
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  Founder Transcript
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Dictate or paste a conversation, then extract execution
                  tasks.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isRecording
                      ? "animate-pulse bg-red-500"
                      : "bg-slate-300"
                  }`}
                />
                {isRecording ? "Listening..." : "Not Recording"}
              </div>
            </div>

            <div className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/60 p-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isRecording}
                  className="group flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-xl font-black text-white shadow-xl shadow-blue-200 transition duration-300 hover:-translate-y-1 hover:shadow-2xl disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
                  aria-label="Start recording"
                >
                  <span className={isRecording ? "animate-pulse" : ""}>M</span>
                </button>

                <div className="flex-1">
                  <p className="font-bold text-slate-950">
                    Browser voice transcription
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Use Chrome speech recognition to populate the transcript
                    automatically before extracting tasks.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isRecording}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Start Recording
                  </button>

                  <button
                    type="button"
                    onClick={stopRecording}
                    disabled={!isRecording}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    Stop Recording
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-[350px] flex-[1_1_auto] flex-col rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:min-h-[390px] xl:min-h-[430px]">
              <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Transcript workspace
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {isVoiceTranscript
                      ? "Voice-generated transcript"
                      : "Manual transcript input"}
                  </p>
                </div>
                <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                  {transcript.length} characters
                </p>
              </div>

              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setIsVoiceTranscript(false);
                }}
                placeholder="Paste founder transcript here..."
                className="min-h-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-900 shadow-inner outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="mt-3 flex shrink-0 flex-col gap-2 xl:flex-row xl:items-center">
              <button
                onClick={extractTasks}
                disabled={isExtracting || transcript.trim().length === 0}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
              >
                {isExtracting && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {isExtracting ? "Extracting Tasks..." : "Extract Tasks"}
              </button>

              {successMessage && (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {successMessage}
                </p>
              )}

              {errorMessage && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {errorMessage}
                </p>
              )}
            </div>

            <section className="mt-3 grid shrink-0 grid-cols-2 gap-2 2xl:grid-cols-4">
              {statsCards.map((stat) => (
                <div
                  key={stat.title}
                  className={`group rounded-2xl border border-white bg-gradient-to-br ${stat.gradientClassName} p-2.5 shadow-md shadow-slate-200/70 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg`}
                >
                  <div className="flex flex-col gap-1">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black shadow-md transition duration-300 group-hover:scale-105 ${stat.iconClassName}`}
                    >
                      {stat.icon}
                    </div>
                    <div>
                      <p className="truncate text-[10px] font-semibold text-slate-500">
                        {stat.title}
                      </p>
                      <p className="text-xl font-black tracking-tight text-slate-950">
                        {stat.value}
                        {stat.title === "Completion Rate" ? "%" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>

          <div className="flex min-h-0 flex-col rounded-3xl border border-white bg-white p-4 shadow-xl shadow-slate-200/70">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Execution dashboard
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  Saved Tasks
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Auto-loaded from Supabase on page load.
                </p>
              </div>

              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {filteredTasks.length}/{tasks.length}
              </span>
            </div>

            <div className="sticky top-0 z-10 mb-3 shrink-0 rounded-2xl bg-white pb-1">
              <label
                htmlFor="task-search"
                className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400"
              >
                Search tasks
              </label>
              <input
                id="task-search"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search by employee, task, deadline, or status..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {isLoadingTasks ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div>
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <p className="text-sm font-semibold text-slate-500">
                  Loading saved tasks...
                </p>
                </div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No saved tasks yet. Extract a transcript to create the first
                task cards.
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                No matching tasks found.
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth pr-1">
                <div className="grid gap-3 xl:grid-cols-2">
                  {filteredTasks.map((task, index) => (
                    <div
                      key={task.id || index}
                      className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-md shadow-slate-100 transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-slate-200"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-black text-white shadow-lg shadow-blue-100">
                            {getInitials(task.employee)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Owner
                            </p>
                            <p className="truncate text-sm font-bold text-slate-950">
                              {task.employee || "Unassigned"}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStatusBadgeClass(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-sm font-bold leading-5 text-slate-950">
                        {task.task || "Untitled task"}
                      </p>

                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Deadline
                        </p>
                        <p className="truncate text-xs font-semibold text-slate-700">
                          {task.deadline || "Not mentioned"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
