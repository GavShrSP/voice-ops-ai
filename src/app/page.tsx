"use client";

import { useEffect, useMemo, useState } from "react";
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
  badgeClassName: string;
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
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
    };
  }, [tasks]);

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

  const getStatusBadgeClass = (status: string) => {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === "completed") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (normalizedStatus === "pending") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  const statsCards: StatCard[] = [
    {
      title: "Total Tasks",
      value: dashboardStats.total,
      helper: "All saved work items",
      badgeClassName: "border-sky-100 bg-sky-50 text-sky-700",
    },
    {
      title: "Pending Tasks",
      value: dashboardStats.pending,
      helper: "Waiting on action",
      badgeClassName: "border-amber-100 bg-amber-50 text-amber-700",
    },
    {
      title: "Completed Tasks",
      value: dashboardStats.completed,
      helper: "Marked as done",
      badgeClassName: "border-emerald-100 bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-sky-700">
              Founder Ops Workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
              VoiceOps AI Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
              Turn founder transcripts into clear owner-based tasks and keep the
              saved task list visible in one place.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="block font-semibold text-slate-950">
              Supabase synced
            </span>
            Saved tasks load automatically
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {statsCards.map((stat) => (
            <div
              key={stat.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div
                className={`mb-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${stat.badgeClassName}`}
              >
                {stat.title}
              </div>
              <p className="text-4xl font-bold text-slate-950">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-500">{stat.helper}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-slate-950">
                Founder Transcript
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Paste the latest call notes, then extract tasks for the team.
              </p>
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste founder transcript here..."
              className="min-h-44 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={extractTasks}
                disabled={isExtracting || transcript.trim().length === 0}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isExtracting ? "Extracting Tasks..." : "Extract Tasks"}
              </button>

              {successMessage && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {successMessage}
                </p>
              )}

              {errorMessage && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {errorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Saved Tasks
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Loaded from Supabase on page load.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {tasks.length} total
              </span>
            </div>

            {isLoadingTasks ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Loading saved tasks...
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No saved tasks yet. Extract a transcript to create the first
                task cards.
              </div>
            ) : (
              <div className="grid gap-4">
                {tasks.map((task, index) => (
                  <div
                    key={task.id || index}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Employee
                        </p>
                        <p className="font-semibold text-slate-950">
                          {task.employee}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          task.status
                        )}`}
                      >
                        {task.status}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-slate-900">
                      {task.task}
                    </p>

                    <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="font-semibold text-slate-700">
                        Deadline:
                      </span>{" "}
                      {task.deadline}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
