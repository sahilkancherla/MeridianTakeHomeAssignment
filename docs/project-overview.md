# Project Overview

## Section 0: Context

Meridian builds agents for enterprises in underserved, legacy industries. One of the core challenges in our product is context collection. When we go into an enterprise, we typically have well under a week to collect comprehensive context on how their processes actually run: who does what, in what order, and with what exceptions. Once we have that process context nailed down, turning it into a working agent is the comparatively easy part.

This take-home is built around that challenge. Part of it asks you to design a good way to capture that process context. The other part asks you to think through the deeper question underneath it: once you have that context, how can we design a self-healing agent that operates on this rich context?

### The core tension

There are two broad ways to represent an agent:

1. **A visual workflow builder**: drag-and-drop, directed-acyclic-graph (DAG) style nodes.
2. **Code-first agents**: the logic lives in actual code, not in a graph schema.

Most tools in this space, including workflow builders, agent platforms, and automation tools, converge on the first option. It's the safer choice for a demo: it looks approachable, and it's easy for a non-technical buyer to understand at a glance. We've gone the other way, because we've run into problems with the visual-builder approach once you get past the demo stage.

We want you to form your own opinion on why, and defend it, rather than just take our word for it. We won't spell out the answer, but here are three threads worth pulling on as you think it through:

- A DAG and a state machine are not the same thing. What can a state machine express that a strictly acyclic graph can't, and does that distinction actually matter for real-world business processes?
- Every abstraction trades flexibility for ease of use. At what point does a low-code abstraction become harder to build on top of than the underlying logic would have been to write in code directly?
- Frontier coding agents (Cursor, Codex, Claude Code, and similar tools) are very good at reading, writing, and iterating on actual code. If the underlying system is a custom JSON or graph schema instead of code, what does that cost you when you want an AI agent that can be easily modified to fix errors or inaccuracies?

Your Deliverables should include a short section on where you landed on this, grounded in what you actually built rather than written as an abstract essay.

---

## Section 1: The stack

You'll be working with the same stack we use in production:

- **React.** Required for the frontend whiteboard.
- **Temporal.** An open-source durable execution platform. You write workflow logic as ordinary code, and it handles state persistence, retries, timeouts, and recovery from failures behind the scenes, so a long-running process can survive crashes, deploys, and network hiccups without you hand-rolling that resilience yourself. Let us know if you need help creating a Temporal account.
- **Composio.** How we call out to third-party tools, like Gmail, from agent code.
- **Supabase.** Our database layer in production.

We're not handing you a required folder structure or file template for this trial. We do care a lot about how you organize the repo, though. Structure it the way you would if you were handing it to a teammate who's never seen it before. Good naming, clear separation of concerns, and a README that orients a stranger quickly will all be noticed.

---

## Section 2: Your Tasks

Here's the gap this take home is built around: right now, when we onboard a customer, a non-technical process owner has to describe their business process to us in chat, docs, and screen-shares, and we manually turn that into something an agent can act on.

That's the "collect comprehensive context in under a week" problem from Section 0. We want a structured front end for that first half: a whiteboard a process owner can use themselves, that an AI agent can review, and that ultimately produces a frozen spec a coding agent could build from.

This breaks into two tasks.

### Task 1: Building Whiteboard Mode

#### a) The canvas

A simple whiteboard or canvas UI (think Miro or FigJam, simplified) where a **non-technical** process owner can describe a business process using a small, fixed set of primitives, not free-form code or graphs.

By "primitive," we mean a basic building block the process owner drops onto the canvas, like a card representing a trigger, an input, a business rule, or a system involved in the process, that means something on its own and combines with other primitives to describe the full process. Designing that set of primitives is part of the exercise; we're not handing you the list.

This matters because of a real tradeoff. Primitives need to be simple enough that someone non-technical can pick them up without training, but expressive enough to capture the actual logic of a messy business process, branches and exceptions included. Too few or too generic, and the canvas can't represent anything real. Too many or too granular, and you've effectively rebuilt a programming language that no process owner will want to touch. Don't add a primitive you can't explain to a non-engineer in one sentence.

#### b) AI review

Build an agent that scans the canvas, identifies gaps in understanding and leaves structured comments on it, Figma-style, rather than as a chat sidebar bolted on. Comments should have a status: `open`, `answered`, `rejected`, `resolved`.

#### c) Revision loop

The process owner at the enterprise should be able to respond to comments and update the canvas, and see comment status change accordingly. This loop is the whole point. Unresolved ambiguity here is what turns into a brittle agent later.

#### d) Submit to a frozen spec

A "Submit" action that freezes the current canvas into an immutable spec object (JSON is fine) containing the cards, their connections, and resolved assumptions: everything a downstream coding agent would need. Once submitted, the spec shouldn't silently change if the canvas changes later.

### Task 2: Whiteboard mode to self-healing agent

Once you have a submitted spec, the second task is to turn it into a working agent, and have that agent improve itself against a set of test cases rather than stopping at a single generated version.

- **Build a skeleton.** Put together a small, reusable scaffold for an agent: common functions and structure (an entry point, a place for step execution, error handling, a place for business logic, a place for tool calls) that any agent built from a spec could share. This shouldn't be specific to one customer's process.
- **Generate an initial agent.** Build a coding agent that takes the submitted spec and the skeleton and produces a first working version of the agent. How you generate it (LLM-driven codegen, templating, some mix) is up to you. Hint: you may want to look at /skills on Codex or Claude Code for this.
- **Write an eval suite.** A handful of test cases that exercise the spec's logic and check the agent's actual output against expected output.
- **Close the loop.** Run the generated agent against the eval suite, look at what fails, and have the agent modify its own logic or architecture and re-run, repeating until it's passing all (or as close to all as time allows) of the eval cases. Hint: Again, you may want to look at /skills on Codex or Claude code for this.

### Task 3: End-to-end example

Tie everything together using a simplified version of a real Meridian customer workflow: an **Inbound Import Receiving Agent**.

Imagine you're deploying an AI agent for a warehouse receiving team.

Before import containers arrive at a warehouse, the exporter sends documentation (specifically **Commercial Invoices** and **Certificates of Analysis (COAs)**) to the warehouse via email. Before a shipment can be received, the receiving team manually reviews every email to ensure all required documents are present and that the information across those documents is complete and consistent.

The attached SOP below describes the workflow in more detail.

example_agent_impound_import_recieving.pdf

Your end-to-end example should walk through that entire lifecycle:

1. **Whiteboard the process**
    - Since you won't have access to a real customer during this exercise, role-play as both the process owner and the implementation team. Start by creating an intentionally incomplete version of the process based on the attached SOP, then iterate on it as though you were interviewing a customer.
2. **AI review**
    - Have your AI identify missing information or ambiguous business logic by leaving structured comments on the whiteboard.
    - Respond to those comments as the mock business user and update the whiteboard accordingly.
    - Complete **at least two rounds** of AI review before considering the process sufficiently specified.
3. **Submit to a frozen specification**
    - Generate an immutable specification representing the final business process.
4. **Generate an agent**
    - Use that specification to generate a working agent using your shared agent skeleton.
5. **Evaluate and improve**
    - Run the generated agent against the provided evaluation documents.
    - Identify failures, update the generated agent, and repeat until the agent performs correctly across the evaluation set.

### Evals / Training Set

As part of this project, Alfonso or Sid will provision a test inbox for you (e.g. `yourname@usemeridian.io`). We'll forward approximately **10 representative sample emails** to this inbox that simulate the types of emails a real receiving team would receive.

Your agent should connect to this inbox (we use **Composio** for Gmail access) and use these emails as its primary evaluation dataset. The goal is for your agent to process the inbox end-to-end, identify any missing documentation or discrepancies, and produce the expected output according to the attached SOP.

We'll share the inbox credentials (username/password) and any additional setup instructions asynchronously after sending you this take-home.

---

## Section 3: Process and timeline

**Day 1**

Spend time on high-level design and a PRD (product requirements document) before getting into actual code. Something like Lucid Chart or Miro works well for sketching out your high-level design; feel free to supplement that with a Google Doc or Notion doc explaining your primitive set, your comment and revision model, and how you plan to build the self-healing agent. Think of this as an asynchronous design review. Send it over before you start the heavy implementation process.

Deliverables:

- Links to your high-level design / PRD (Lucid Chart, Miro, Google Doc, Notion doc, whatever you used)
- Once you're done, text Alfonso and Sid some times that work to schedule a Design review to go over these artifacts.

**Days 2 to 3**

Build. You have roughly 48 hours of elapsed time from when we confirm your design direction. We're available for questions throughout (see the note up top), so use us. Asking a sharp clarifying question is a positive signal, not a negative one.

Deliverables:

- A working repo (or deployable link) with the canvas, AI comments, revision loop, submit-to-spec flow, and the self-healing agent loop. Structure it cleanly. We'll be reading it as if you were already on the team.
- A short demo video (Loom is fine) showing the flow end to end.
- A Word / PDF Doc covering:
    - How to run it
    - Your primitive set and why you chose it
    - Your comment and spec data model
    - Where you landed on the Section 0 core tension, grounded in what you built
    - What you'd do differently with more time

---

## Section 4: What we're evaluating

- **Primitive design**: simple enough for a non-technical user, expressive enough to be useful
- **Comment and revision loop**: does it actually capture and resolve ambiguity, or is it decorative
- **Spec correctness**: is the frozen spec actually sufficient to hand to a coding agent
- **Repo structure and organization**: would a teammate be able to pick this up cleanly
- **Communication**: clarity of the high-level design, the Loom, the README, and how you handled ambiguity
- **Judgment**: what you chose to build well versus what you consciously cut, given the time box
