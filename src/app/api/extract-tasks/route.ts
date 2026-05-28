export async function POST(req: Request) {
  try {
    const body = await req.json();

    const transcript = body.transcript;

    console.log("Transcript:", transcript);

    const mockTasks = [
      {
        employee: "Amit",
        task: "Call supplier",
        deadline: "Tomorrow",
        status: "Pending",
      },
      {
        employee: "Neha",
        task: "Upload creatives",
        deadline: "Today",
        status: "Pending",
      },
    ];

    return Response.json({
      result: mockTasks,
    });
  } catch (error) {
    console.error("FULL ERROR:", error);

    return Response.json({
      error: "Something went wrong",
    });
  }
}