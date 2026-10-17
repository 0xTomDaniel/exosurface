# Exosurface

Exosurface is a shared, adaptive workspace where a person and their personal agent communicate and act through an evolving thread of visual interaction, language, or both.

## Language

**Exo**: The personal agent that helps the user plan and act across their information and devices.
_Avoid_: Exosurface (the workspace, not the agent).

**Thread**: The continuing exchange between the person and Exo, ordered through time and composed of visual interaction, language, or both. A thread remains a complete conversation when it contains no chat.
_Avoid_: Chat transcript (language is optional).

**Turn**: A meaningful contribution to the thread from either participant, expressed through a visualization, direct interaction, language, or a combination of these.
_Avoid_: Text message, agent run (neither defines a turn).

**Interaction context**: The shared meaning relevant at a point in the exchange, including prior contributions, the current surface, referenced objects, and relevant source information.
_Avoid_: Chat history alone.

**Surface**: The interactive visual expression of the exchange, which materializes around its intent and context and can evolve across turns and agent activities.
_Avoid_: Chat attachment, agent run.

**Utterance**: A written or spoken linguistic expression within the exchange, which can combine with a surface interaction in the same turn.
_Avoid_: Separate conversation (language and visual interaction can share one thread).

**Agenda**: The user's daily plan, assembled from commitments, tasks, and preferences.

**Agenda task**: A piece of work the user may schedule or complete as part of their agenda.
_Avoid_: Protocol task (an agent execution concept).

**Proposal**: A suggested change awaiting the user's decision when acceptance is required. A pending proposal does not by itself mean Exo has paused its work.
_Avoid_: Applied change.

**Input request**: A question or authorization request that Exo must resolve before continuing particular work. It differs from a proposal that can remain available while other work continues.
_Avoid_: Proposal (a pending suggestion need not block work).

**Agent work**: An activity Exo undertakes on the person's behalf, whose progress and outcome remain meaningful while no person is viewing the thread.
_Avoid_: Agenda task (the person's schedulable work), turn (an expression in the exchange).

**Work trigger**: An occurrence that prompts Exo to act, such as the arrival of a scheduled time or a change to the person's information. It can lead to an Exo-authored turn without being a contribution authored by the person.
_Avoid_: User message (a trigger does not imply the person spoke), agent work (the occurrence and the resulting activity differ).

**Effect**: An attempted change to authoritative information or device state, with an outcome distinct from the person's authorization to attempt it.
_Avoid_: Acceptance (authorization is not successful application).

**Acceptance**: The user's authorization to apply a particular proposal against the information on which it was based.
_Avoid_: Successful application (authorization and execution can have different outcomes).
