"""
One-time script to clean up Neo4j labels that have been migrated to Supabase.
Removes: :User, :GithubConnection, :GithubOAuthState nodes.
"""

import argparse
import sys

from graph.neo4j_client import Neo4jClient

def get_counts(client, label):
    result = client.run_read(f"MATCH (n:{label}) RETURN count(n) AS c")
    return result[0]["c"] if result else 0

def delete_label(client, label):
    # Process in batches to avoid running out of memory on large graphs
    total_deleted = 0
    while True:
        result = client.run_write(f"MATCH (n:{label}) WITH n LIMIT 10000 DETACH DELETE n RETURN count(*) AS deleted")
        deleted = result[0]["deleted"] if result else 0
        total_deleted += deleted
        if deleted == 0:
            break
    return total_deleted

def main():
    parser = argparse.ArgumentParser(description="Clean up migrated labels from Neo4j")
    parser.add_argument("--yes", action="store_true", help="Confirm deletion")
    args = parser.parse_args()

    client = Neo4jClient()
    try:
        labels_to_delete = ["User", "GithubConnection", "GithubOAuthState"]
        
        print("Migrated node counts in Neo4j:")
        counts = {}
        for label in labels_to_delete:
            counts[label] = get_counts(client, label)
            print(f"  :{label} - {counts[label]} nodes")
            
        if sum(counts.values()) == 0:
            print("\nNo nodes to delete. Graph is already clean.")
            return

        if not args.yes:
            print("\nDeletion aborted. Run with --yes to perform the deletion.")
            sys.exit(1)

        print("\nDeleting nodes...")
        for label in labels_to_delete:
            if counts[label] > 0:
                deleted = delete_label(client, label)
                print(f"  Deleted {deleted} :{label} nodes")
        
        print("\nCleanup complete.")
    finally:
        client.close()

if __name__ == "__main__":
    main()
